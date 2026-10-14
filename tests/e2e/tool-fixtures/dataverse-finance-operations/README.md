# Mixed connection regression fixture

This is a snapshot of the Dataverse + F&O example moved to
`sample-tools\FinOps\dataverse-finance-operations`.
The maintained example lives in the `sample-tools` repository.

The desktop tests retain this snapshot so CI does not require a separate
checkout or network access. `fixtures.ts` loads its manifest and `dist`
files for `mixedConnectionExample.spec.ts`. When changing the maintained
example's connection behavior, update this snapshot and have the tests run
against it too. These files run directly without a build step.
