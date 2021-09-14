const core = require('@actions/core')
const github = require('@actions/github')

async function base2HeadUpdate () {
  try {
    // Get the JSON webhook payload for the event that triggered the workflow
    // const payloadStr = JSON.stringify(github.context, undefined, 2)
    // console.log(`The event payload: ${payloadStr}`)

    const repoToken = core.getInput('repo-token')
    const blockedLabels = JSON.parse(core.getInput('skip-labels')).map(v => v.toLowerCase())

    const payload = github.context.payload
    const repoName = payload.repository.name
    const ownerName = payload.repository.owner.name

    const refsarr = payload.ref.split('/')
    refsarr.splice(0, 2)
    const branchName = refsarr.join('/')

    console.log(
      `Operating in: ${ownerName}/${repoName}@${branchName}`
    )

    console.log(
      `Looking for open PRs to ${branchName} which have auto merge enabled
      but are not labelled with any of: [${blockedLabels}]`
    )
    const octokit = github.getOctokit(repoToken)
    const pullsResponse = await octokit.rest.pulls.list(
      {
        owner: ownerName,
        repo: repoName,
        base: branchName,
        state: 'open',
        sort: 'created',
        direction: 'asc'
      }
    )
    if (!('data' in pullsResponse) || pullsResponse.data.length === 0) {
      console.log(`No pulls found pointing to branch: ${branchName}`)
      return
    }

    const failures = []
    const successes = []

    for (let pi = 0; pi < pullsResponse.data.length; pi++) {
      const pullNumber = pullsResponse.data[pi].number
      const labels = pullsResponse.data[pi].labels

      let hasSkipLabel = false
      for (let li = 0; li < labels.length; li++) {
        let labelFound = labels[li].name.toLowerCase()
        if (blockedLabels.includes(labelFound)) {
          hasSkipLabel = true
          console.log(`Pull ${pullNumber} has skip label!: ${labelFound}`)
          break
        }
      }

      const base2headEnabled = (
        ('auto_merge' in pullsResponse.data[pi]) &&
        (!!pullsResponse.data[pi].auto_merge) &&
        (!!pullsResponse.data[pi].auto_merge.enabled_by)
      )

      if (base2headEnabled && !hasSkipLabel) {
        const enablingUsr = pullsResponse.data[pi].auto_merge.enabled_by.login
        console.log(
          `Updating head for #${pullNumber}; auto merge enabled by ${enablingUsr}`
        )
        try {
          const updateResponse = await octokit.rest.pulls.updateBranch(
            {
              owner: ownerName,
              repo: repoName,
              pull_number: pullNumber
            }
          )
          console.log(updateResponse)
          successes.push(`#${pullNumber}`)
        } catch (e) {
          console.log(`Failure while trying to update #${pullNumber}`)
          console.log(typeof e)
          console.log(e)

          const hasResponseMessage = (
            ('response' in e) &&
            ('data' in e.response) &&
            ('message' in e.response.data)
          )
          if (hasResponseMessage && e.response.data.message.indexOf('merge conflict') > -1) {
            console.log(
              `Pull #${pullNumber} has conflicts. Skipping.`
            )
          } else {
            failures.push(
              {
                pull_number: pullsResponse.data.html_url
              }
            )
          }
        }
      } else {
        console.log(
          `Pull #${pullNumber} skipped.`
        )
      }
    }

    if (successes.length > 0) {
      core.setOutput('updated_pulls', successes.join(','))
    } else {
      core.setOutput('updated_pulls', 'None')
    }
    if (failures.length > 0) {
      const failuresStr = JSON.stringify(failures, undefined, 4)
      core.setFailed(`Failed to update: ${failuresStr}`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function run () {
  await base2HeadUpdate()
}
run()
