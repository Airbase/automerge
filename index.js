const core = require('@actions/core')
const github = require('@actions/github')

class Base2HeadUpdate {
  shouldRun (prObj) {
    const pullNumber = prObj.number
    const labels = prObj.labels
    let hasSkipLabel = false
    let hasActLabel = false
    for (let li = 0; li < labels.length; li++) {
      const labelFound = labels[li].name.toLowerCase()
      if (this.blockedLabels.includes(labelFound)) {
        hasSkipLabel = true
        console.log(`Pull #${pullNumber} has skip label: ${labelFound}!`)
        break
      } else if (!!this.actLabel && labelFound === this.actLabel.toLowerCase()) {
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

  async processPull (prObj) {
    const pullNumber = prObj.number
    const base2headEnabled = this.shouldRun(prObj)

    if (base2headEnabled) {
      try {
        const updateResponse = await this.octokit.rest.pulls.updateBranch(
          {
            owner: this.ownerName,
            repo: this.repoName,
            pull_number: pullNumber
          }
        )
        this.successes.push(`#${pullNumber}`)
        console.log(`Pull updated: ${prObj.html_url} :: ${updateResponse}`)
      } catch (e) {
        console.error(`Failure while trying to update #${pullNumber}`)
        console.error(e)

        const hasMergeConflicts = (
          'response' in e && 'data' in e.response && 'message' in e.response.data &&
          (e.response.data.message.indexOf('merge conflict') > -1)
        )
        if (hasMergeConflicts) {
          console.error(`Pull #${pullNumber} has conflicts. Skipping.`)
        } else {
          this.failures.push({ pull_number: prObj.html_url })
        }
      }
    } else {
      console.log(`Pull skipped: ${prObj.html_url}`)
    }
  }

  constructor () {
    const repoToken = core.getInput('repo-token')
    this.blockedLabels = JSON.parse(core.getInput('skip-labels')).map(v => v.toLowerCase())
    this.actLabel = core.getInput('act-label')

    const payload = github.context.payload
    this.repoName = payload.repository.name
    this.ownerName = payload.repository.owner.name

    const refsarr = payload.ref.split('/')
    refsarr.splice(0, 2)
    this.branchName = refsarr.join('/')

    console.log(
      `Operating in: ${this.ownerName}/${this.repoName}@${this.branchName}`
    )

    console.log(`Looking for open PRs to ${this.branchName}`)
    console.log(`Blocked: [${this.blockedLabels}], include:${this.actLabel}`)

    this.octokit = github.getOctokit(repoToken)
    this.failures = []
    this.successes = []
  }

  async run () {
    try {
      await this.octokit.paginate(this.octokit.rest.pulls.list, {
        owner: this.ownerName,
        repo: this.repoName,
        base: this.branchName,
        state: 'open',
        sort: 'created',
        direction: 'asc'
      }).then(pullsResponse => {
        for (let pi = 0; pi < pullsResponse.data.length; pi++) {
          this.processPull(pullsResponse[pi])
        }
      })

      if (this.successes.length > 0) {
        core.setOutput('updated_pulls', this.successes.join(','))
      } else {
        core.setOutput('updated_pulls', 'None')
      }
      if (this.failures.length > 0) {
        const failuresStr = JSON.stringify(this.failures, undefined, 4)
        core.setFailed(`Failed to update: ${failuresStr}`)
      }
    } catch (error) {
      core.setFailed(error.message)
    }
  }
}

async function run () {
  await Base2HeadUpdate()
}
run()
