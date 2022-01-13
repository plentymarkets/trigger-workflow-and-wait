import * as core from '@actions/core'
import * as octokit from '@actions/github'
import {wait} from './wait'

async function runAction(): Promise<void> {
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

    const notTimedout = (): boolean =>
      Date.now() - dispatchedAt.getTime() < timeout * 1000

    /* eslint-disable no-inner-declarations */
    async function runPeriodically(time: number): Promise<void> {
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
          run = runs.find(r => {
            const runStartedAt = new Date(r.run_started_at as string)
            return runStartedAt.getTime() >= dispatchedAt.getTime()
          })
          if (run) {
            core.info(
              `Related workflow run found. See ${run.html_url} for details. Waiting for its completion now.`
            )
          }
        } else {
          const result = await github.rest.actions.getWorkflowRun({
            owner,
            repo,
            run_id: run.id
          })
          run = result.data
          core.info(`Current status: ${run.status}`)
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

    // start the loop - get the workflow run, wait for it to complete and report the status.
    return await runPeriodically(interval * 1000)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

runAction()
