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
    const triggerWorkflow = core.getBooleanInput('trigger-workflow')

    core.startGroup('Read inputs')
    core.debug(`owner: ${owner}`)
    core.debug(`repo: ${repo}`)
    core.debug(`ref: ${ref}`)
    core.debug(`workflow_id: ${workflow_id}`)
    core.debug(`interval: ${interval}`)
    core.debug(`timeout: ${timeout}`)
    core.debug(`trigger-workflow: ${triggerWorkflow}`)
    core.endGroup()

    // store time when we trigger the workflow
    const dispatchedAt = new Date()

    // get authenticated octokit client
    const github = octokit.getOctokit(token)

    // create a workflow_dispatch event if requested
    if (triggerWorkflow) {
      await github.rest.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id,
        ref
      })
    }

    const notTimedout = (): boolean =>
      Date.now() - dispatchedAt.getTime() < timeout * 1000

    /* eslint-disable no-inner-declarations, @typescript-eslint/no-explicit-any */
    async function runPeriodically(time: number): Promise<any> {
      let iterationCount = 0
      let workflowRun // TODO(pweyrich): find the proper type!
      while (
        !(workflowRun && workflowRun.status === 'completed' && notTimedout())
      ) {
        iterationCount++
        core.debug(`Iteration ${iterationCount}`)
        await wait(time)
        // check whether we already got the related run (in particular its id) in the list
        if (!workflowRun) {
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
          workflowRun = runs.find(r => {
            const runStartedAt = new Date(r.run_started_at as string)
            return runStartedAt.getTime() >= dispatchedAt.getTime()
          })
          if (workflowRun) {
            core.info(
              `Related workflow run found. See ${workflowRun.html_url} for details. Waiting for its completion now.`
            )
          }
        } else {
          const result: any = await github.rest.actions.getWorkflowRun({
            owner,
            repo,
            run_id: workflowRun.id
          })
          workflowRun = result.data
          core.info(`Current status: ${workflowRun.status}`)
        }
      }
      if (!workflowRun) {
        // timed out!!
        core.setFailed(
          `Action timed out. A related workflow run could not be found within ${timeout} seconds.`
        )
      }
      if (workflowRun?.status !== 'completed') {
        // timed out!!
        core.setFailed(
          `Action timed out. The workflow took more than ${timeout} seconds to complete.`
        )
      }
      if (workflowRun?.conclusion === 'failure') {
        // watched workflow run failed!
        core.setFailed(
          `Workflow run failed. See ${workflowRun.html_url} for details.`
        )
      }
      return workflowRun
    }

    core.debug('Starting the loop...')
    // start the loop - get the workflow run, wait for it to complete and report the status.
    return await runPeriodically(interval * 1000)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error)
    }
  }
}

run()
