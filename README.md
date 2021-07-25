# automerge-base2head

Auto merge/update branches when commit is pushed to base on all open pull requests

This action keeps your pull request `head` updated with all changes from `base`.

**Note: This has action runs on the `base` branch!**

## Usage:

### Inputs:
- `repo-token`: (required) A github token with write access to the repo you want to use this action in.
- `automerge-base2head-label`: (optional, defaults to:`BASE2HEAD-AUTOMERGE`) The label to look for on pull requests. Only pull requests with this label will be auto updated.

eg: add a new workflow file with these contents:
```
name: Base2Head 

on:
  push

jobs:
  mergebase:
    runs-on: ubuntu-latest
    steps:
      - name: "Run script"
        uses: mehernosh/automerge-base2head@main
        id: base2head
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          automerge-base2head-label: 'BASE2HEAD-AUTOMERGE'
      - name: "Update results"
        run: echo "Updated ${{steps.base2head.outputs.updated_pulls}} "
```
