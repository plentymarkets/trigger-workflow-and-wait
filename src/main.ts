import * as core from '@actions/core'
import * as octokit from '@actions/github'
import {wait} from './wait'

async function run(): Promise<void> {
  try {
    // read inputs
    const token = core.getInput('token')
    const owner = core.getInput('owner')
    const repo = core.getInput('repo')
    const ref = core.getInput('ref')
    const workflow_id = core.getInput('workflow_id')
    const interval = parseInt(core.getInput('interval'), 10)
    const timeout = parseInt(core.getInput('timeout'), 10)

    // store time when we trigger the workflow
    const dispatchedAt = new Date()

    // get authenticated octokit client
    const github = octokit.getOctokit(token)

    // create a workflow_dispatch event
    await github.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id,
      ref
    })

    const notTimedout = () =>
      Date.now() - dispatchedAt.getTime() < timeout * 1000

    async function runPeriodically(time: number) {
      let run: any // TODO(pweyrich): find the proper type!
      while (!(run && run.status === 'completed' && notTimedout())) {
        await wait(time)
        // check whether we already got the related run (in particular its id) in the list
        if (!run) {
          // TODO: there's a param `created` which may be used to query for runs started after a certain point in time
          // unfortunately this param is not described in the docs
          // see https://octokit.github.io/rest.js/v18#actions-list-workflow-runs for reference
          const result = await github.rest.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id,
            branch: ref,
            event: 'workflow_dispatch'
          })
          const runs = result.data.workflow_runs
          // check whether there's a run in the list, that has been created after we send the workflow_dispatch event.
          run = runs.find(run => {
            const runStartedAt = new Date(run!.run_started_at as string)
            return runStartedAt.getTime() >= dispatchedAt.getTime()
          })
          if (run) {
            core.info(
              `Related workflow run found. See ${run.html_url} for details.`
            )
          }
        } else {
          const result = await github.rest.actions.getWorkflowRun({
            owner,
            repo,
            run_id: run.id
          })
          run = result.data
        }
      }
      if (!run) {
        // timed out!!
        core.setFailed(
          `Action timed out. A related workflow run could not be found within ${timeout} seconds.`
        )
      }
      if (run?.status !== 'completed') {
        // timed out!!
        core.setFailed(
          `Action timed out. The workflow took more than ${timeout} seconds to complete.`
        )
      }
      if (run?.conclusion === 'failure') {
        // watched workflow run failed!
        core.setFailed(`Workflow run failed. See ${run.html_url} for details.`)
      }
      return run
    }

    // start the loop - get the workflow run and check the status until it either failed or succeeded
    return await runPeriodically(interval * 1000)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
