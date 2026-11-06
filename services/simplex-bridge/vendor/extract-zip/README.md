# Local extract-zip security patch

This compatibility copy is based on `extract-zip` 2.0.1, distributed under the included BSD-2-Clause license. It reports version 2.0.2 so it satisfies SimpleX Chat's `^2.0.1` dependency while fixing the two known symlink write paths before the upstream project has published a patched release.

The patch rejects symlink targets outside the extraction root and refuses to write a regular file through an existing symlink. The upstream fixes are documented in [PR 158](https://github.com/max-mapper/extract-zip/pull/158), [PR 160](https://github.com/max-mapper/extract-zip/pull/160), and [PR 161](https://github.com/max-mapper/extract-zip/pull/161). Remove this copy once an upstream release includes equivalent fixes.
