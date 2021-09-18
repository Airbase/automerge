const core = require('@actions/core')
const github = require('@actions/github')

function shouldRun (prObj, blockedLabels, actLabel) {
  const pullNumber = prObj.number
  const labels = prObj.labels
  let hasSkipLabel = false
  let hasActLabel = false
  for (let li = 0; li < labels.length; li++) {
    const labelFound = labels[li].name.toLowerCase()
    if (blockedLabels.includes(labelFound)) {
      hasSkipLabel = true
      console.log(`Pull #${pullNumber} has skip label: ${labelFound}!`)
      break
    } else if (!!actLabel && labelFound === actLabel.toLowerCase()) {
      hasActLabel = true
      console.log(
        `Pull ${pullNumber} has act label: ${labelFound}, continue looking for skip labels`
      )
    }
  }
  const autoMergeEnabled = (
    ('auto_merge' in prObj) && (!!prObj.auto_merge) && (!!prObj.auto_merge.enabled_by)
  )
  if (autoMergeEnabled) {
    console.log(`Automerge enabled by: ${prObj.auto_merge.enabled_by.login}`)
  }

  return !hasSkipLabel && (
    hasActLabel || (
      autoMergeEnabled
    )
  )
}

async function base2HeadUpdate () {
  try {
    // Get the JSON webhook payload for the event that triggered the workflow
    // const payloadStr = JSON.stringify(github.context, undefined, 2)
    // console.log(`The event payload: ${payloadStr}`)

    const repoToken = core.getInput('repo-token')
    const blockedLabels = JSON.parse(core.getInput('skip-labels')).map(v => v.toLowerCase())
    const actLabel = core.getInput('act-label')

    const payload = github.context.payload
    const repoName = payload.repository.name
    const ownerName = payload.repository.owner.name

    const refsarr = payload.ref.split('/')
    refsarr.splice(0, 2)
    const branchName = refsarr.join('/')

    console.log(
      `Operating in: ${ownerName}/${repoName}@${branchName}`
    )

    console.log(`Looking for open PRs to ${branchName}`)
    console.log(`Blocked: [${blockedLabels}], include:${actLabel}`)

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
      const prObj = pullsResponse.data[pi]
      const pullNumber = prObj.number
      const base2headEnabled = shouldRun(prObj, blockedLabels, actLabel)

      if (base2headEnabled) {
        try {
          const updateResponse = await octokit.rest.pulls.updateBranch(
            {
              owner: ownerName,
              repo: repoName,
              pull_number: pullNumber
            }
          )
          successes.push(`#${pullNumber}`)
          console.log(`Pull updated: ${prObj.html_url} :: ${updateResponse}`)
        } catch (e) {
          console.error(`Failure while trying to update #${pullNumber}: ${typeof e}`)
          console.error(e)

          const hasMergeConflicts = (
            'response' in e && 'data' in e.response && 'message' in e.response.data &&
            (e.response.data.message.indexOf('merge conflict') > -1)
          )
          if (hasMergeConflicts) {
            console.error(`Pull #${pullNumber} has conflicts. Skipping.`)
          } else {
            failures.push({ pull_number: pullsResponse.data.html_url })
          }
        }
      } else {
        console.log(`Pull skipped: ${prObj.html_url}`)
      }
      const i_b = 1
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
