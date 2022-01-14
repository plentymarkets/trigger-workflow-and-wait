# Trigger workflow and wait

This actions can trigger a workflow via workflow_dispatch event and wait for it to complete.

## Usage

```yml
- uses: plentymarkets/trigger-workflow-and-wait@main
  with:
    # Token to authenticate against the Github API
    token: ''

    # Repository that contains the workflow.
    repo: ''

    # The owner of the repository.
    owner: ''

    # The ID of the workflow. You can also pass the workflow file name as a string.
    workflow_id: ''

    # The git reference for the workflow. The reference can be a branch or tag name.
    # Usually 'main'
    ref: ''

    # Timeout in seconds.
    timeout: ''

    # Interval (in seconds) to periodically check the workflow status
    interval: ''

    # Whether to trigger the workflow via worfklow_dispatch event
    # Default: true
    trigger-workflow: ''
```
