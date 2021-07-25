const core = require('@actions/core');
const github = require('@actions/github');

async function run() {

    try {
        // Get the JSON webhook payload for the event that triggered the workflow
        const payload_str = JSON.stringify(github.context, undefined, 2)
        console.log(`The event payload: ${payload_str}`);
        
        
        const repo_token = core.getInput("repo-token"); 
        const working_label = core.getInput(
            'automerge-base2head-label'
        );

        var payload = github.context.payload;
        const repo_name = payload.repository.name;
        const owner_name = payload.repository.owner.name;

        var refsarr = payload.ref.split('/')
        refsarr.splice(0,2)
        const branch_name = refsarr.join('/')

        console.log(
            `Operating in: ${owner_name}/${repo_name}@${branch_name}`
        );

        if (working_label.length > 0){
            console.log(
                `Looking for open PRs labeled with: ${working_label}!`
            );
        }else{
            throw {
                "error": "Invalid 'automerge-base2head-label'",
                "message": "Use 'with:' to specify a label to use."
            }
        }
        const octokit = github.getOctokit(repo_token);

        const pulls_response = await octokit.rest.pulls.list(
            {
                "owner": owner_name,
                "repo": repo_name,
                "base": branch_name,
                "state":"open",
                "sort":"created",
                "direction":"asc",
            }
        )
        console.log(pulls_response)

        if (!pulls_response.hasOwnProperty('data') || pulls_response.data.length==0){
            console.log(`No pulls found pointing to branch: ${branch_name}`);
            return;
        }

        var failures = [];
        var successes = []

        for (var pi=0; pi<pulls_response.data.length; pi++){
            var pull_number = pulls_response.data[pi]['number'];
            var labels = pulls_response.data[pi]['labels'];
            var base2head_enabled = false;
            for (var li=0; li<labels.length;li++){
                if (labels[li]["name"] === working_label){
                    base2head_enabled = true;
                    var label_str = JSON.stringify(labels[li], undefined, 4);
                    console.log(`Pull ${pull_number} has label!: ${label_str}`);
                    break;
                }
            }
            if (base2head_enabled){
                try{
                    const update_response = await octokit.rest.pulls.updateBranch(
                        {
                            "owner":owner_name,
                            "repo":repo_name,
                            "pull_number":pull_number,
                        }
                    )
                    console.log(update_response)
                    successes.push(`#${pull_number}`)
                }catch(e){
                    console.log(`Failure while trying to update #${pull_number}`);
                    console.log(e)
                    failures.push(
                        {
                            pull_number: pulls_response.data['html_url']
                        }
                    );
                }
            }else{
                console.log(
                    `Pull #${pull_number} is not labeled "${working_label}". Skipping.`
                );
            }
        }

        if(successes.length > 0){
            core.setOutput("updated_pulls", successes.join(','))
        }
        if(failures.length > 0){
            const failures_str = JSON.stringify(failures, undefined, 4)
            core.setFailed(`Failed to update: ${failures_str}`);
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}
run();