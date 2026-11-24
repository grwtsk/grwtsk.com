# Continuous integration

[site.yml](site.yml) builds and tests the site on pull requests and pushes
to main. It installs the C++ dependencies and Rust/Node toolchains,
uses the checked-in dependency lockfiles, executes the full verification
suite, and uploads the static-site artifact only after success.

Use [Actions](https://github.com/grwtsk/grwtsk.com/actions) to check the
specific commit before merging. If a step fails, open its logs and follow
the [test guide](../../source/web/test/README.md). The workflow does not
publish to grwtsk.com. Deployment and independent public content
verification are described in the [web guide](../../source/web/README.md#publish-and-verify).
