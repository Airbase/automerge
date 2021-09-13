const core = require('@actions/core')
const github = require('@actions/github')

async function run () {
  try {
    // Get the JSON webhook payload for the event that triggered the workflow
    const payloadStr = JSON.stringify(github.context, undefined, 2)
    console.log(`The event payload: ${payloadStr}`)

    const repoToken = core.getInput('repo-token')
    const workingLabel = core.getInput(
      'automerge-base2head-label'
    )

    const payload = github.context.payload
    const repoName = payload.repository.name
    const ownerName = payload.repository.owner.name

    const refsarr = payload.ref.split('/')
    refsarr.splice(0, 2)
    const branchName = refsarr.join('/')

    console.log(
            `Operating in: ${ownerName}/${repoName}@${branchName}`
    )

    if (workingLabel.length > 0) {
      console.log(
                `Looking for open PRs labeled with: ${workingLabel}!`
      )
    } else {
      throw new Error({
        error: "Invalid 'automerge-base2head-label'",
        message: "Use 'with:' to specify a label to use."
      })
    }
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
    console.log(pullsResponse)

    if (!('data' in pullsResponse) || pullsResponse.data.length === 0) {
      console.log(`No pulls found pointing to branch: ${branchName}`)
      return
    }

    const failures = []
    const successes = []

    for (let pi = 0; pi < pullsResponse.data.length; pi++) {
      const pullNumber = pullsResponse.data[pi].number
      const labels = pullsResponse.data[pi].labels
      let base2headEnabled = false
      for (let li = 0; li < labels.length; li++) {
        if (labels[li].name === workingLabel) {
          base2headEnabled = true
          const labelStr = JSON.stringify(labels[li], undefined, 4)
          console.log(`Pull ${pullNumber} has label!: ${labelStr}`)
          break
        }
      }
      if (base2headEnabled) {
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
                    `Pull #${pullNumber} is not labeled "${workingLabel}". Skipping.`
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
run()
