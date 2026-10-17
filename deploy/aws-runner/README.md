# Self-hosted GitHub Actions runner in AWS

Runs the browser tests (`.github/workflows/e2e.yml`) on an EC2 instance in your account, so the
"live" suite can reach a deployed stack from inside AWS and no GitHub-hosted minutes are used.

## Set it up

```bash
cd deploy/aws-runner
tofu init
tofu apply -var github_repository=anasmdoe/openhabit      # owner/repo
```

Then give the instance a GitHub token (it stays in Secrets Manager; Terraform never sees it):

1. GitHub > Settings > Developer settings > Fine-grained personal access tokens: pick **only this
   repository**, permission **Administration: Read and write** (needed to mint runner registration tokens).
2. Store it:
   ```bash
   aws secretsmanager put-secret-value --secret-id openhabit-runner/github-token --secret-string 'github_pat_...'
   ```
3. Within a minute the runner shows up under Settings > Actions > Runners as `openhabit-aws`.

To point the nightly "live" run at your stack, set the repository **variable** `E2E_BASE_URL`
(Settings > Secrets and variables > Actions > Variables) to the app URL, or type it into a manual run.

In a sandbox that denies inline IAM policies add `-var use_managed_iam_policies=true` (the instance role then
gets the broader `SecretsManagerReadWrite`; use the default in a real account). The boot log is also written to the
serial console: `aws ec2 get-console-output --instance-id <id> --latest` shows how far it got and
"waiting for a GitHub token" until you store one.

## How it behaves

- **Ephemeral.** The runner takes one job, deregisters, and a fresh one registers. A job cannot leave
  files, processes or credentials behind for the next.
- **No inbound ports.** Log in with `aws ssm start-session --target <instance_id>` (output `shell_access`).
- **IMDSv2 only, encrypted disk**, an instance role that can read just that one secret.
- **Public repositories:** do not use a self-hosted runner for pull requests from forks. The workflow
  only runs for pushes, the nightly schedule, manual runs and same-repository pull requests.

## Cost

A `t3.medium` is about $30 a month if left running (`use_spot = true` cuts that by about 70%). Stop the
instance when you do not need CI (`aws ec2 stop-instances`); it re-registers itself on start.
Remove everything with `tofu destroy`.

## Test the module offline

```bash
tofu test     # mocked AWS provider; no account needed
```
