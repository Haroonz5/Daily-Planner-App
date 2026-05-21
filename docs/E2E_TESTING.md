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

## Expanded Production Flows

The Maestro folder now includes smoke, AI planner, settings systems, and focus mode flows. Validate all flow files with:

```bash
npm run e2e:validate
```

Run the complete suite on a simulator or installed preview build with:

```bash
npm run e2e:maestro:all
```
