# End-to-End Testing

This repo includes a Maestro smoke flow in `e2e/maestro/smoke.yaml`.

## Validate the flow syntax used by CI

```bash
npm run e2e:validate
```

## Run on a local simulator/device

Install Maestro first, start a development build or simulator build, then run:

```bash
maestro test e2e/maestro/smoke.yaml
```

The smoke flow covers the interview-critical loop: launch, open Add Task, create a task, confirm saved feedback, and return to Today.
