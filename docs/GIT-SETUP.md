# Portable Git setup across computers

Use these steps once on each laptop. Generate a separate SSH key on each machine; add both public keys to GitHub and never copy a private key between computers. Terminal Git access is separate from the app’s optional browser-based GitHub Sync token.

Replace the all-caps placeholders before running a command. On a managed work laptop, follow the employer’s source-control and key-storage policy.

## Use the same repository URL on both computers

Keep this repository’s saved remote canonical:

```text
git@github.com:themadat/game-timer.git
```

The repository should not store an SSH alias, an absolute private-key path, or a computer-specific `core.sshCommand`. Each computer selects its own credentials outside the repository. A commit’s `user.name` and `user.email` identify its author; they do not select the GitHub account used for authentication.

If the personal computer already pushes successfully as `themadat`, its authentication setup needs no change. On a computer where `github.com` uses a work account, keep that existing SSH profile and use a separate personal profile in that computer’s `~/.ssh/config`:

```text
Host gh-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes
```

The identity file must name an existing key on that computer whose public half is registered with `themadat`. Reuse a working personal profile when one already exists; do not regenerate or copy a private key. The alias and key filename are local choices, so the personal computer can use a different filename or its default profile.

Verify the personal profile first:

```sh
ssh -T git@gh-personal
```

It should say `Hi themadat!` followed by the expected notice that GitHub does not provide shell access. Then add this rule to that computer’s global Git configuration:

```sh
git config --global 'url.git@gh-personal:themadat/.insteadOf' 'git@github.com:themadat/'
```

Here `--global` means the current user’s configuration on this computer. The rule matches only SSH URLs in the `themadat/` namespace; work repositories under other owners keep their existing authentication. Keep the rule in the computer’s own Git configuration, not in the shared checkout or a configuration synced to another computer without the same SSH profile. This uses Git’s documented [URL rewriting](https://git-scm.com/docs/git-config#Documentation/git-config.txt-urlltbasegtinsteadOf).

Verify the stored remote, the locally resolved destination, and push permission without publishing:

```sh
git config --local --get remote.origin.url
git remote get-url origin
git push --dry-run origin main
```

On the work computer, the first command should retain `git@github.com:themadat/game-timer.git`; the second can resolve to `git@gh-personal:themadat/game-timer.git`. The ordinary `git pull` and `git push origin main` commands then work on either computer without editing the remote when switching devices.

If a combined commit-and-push command reports a successful commit followed by `Permission ... denied to ...`, the commit is already saved locally. Fix authentication and retry the push; do not recreate or reset that commit.

## First-time setup

The remaining steps are for computers that do not yet have working credentials. An existing work account does not automatically have access to repositories owned by a personal account; configure the personal profile above as well when needed.

## Personal laptop

Confirm that Git is available, then set the author attached to commits made from the personal laptop:

```sh
git --version
git config --global user.name "YOUR NAME"
git config --global user.email "YOUR PERSONAL GITHUB EMAIL"
git config --global init.defaultBranch main
git config --global pull.ff only
git config --global fetch.prune true
git config --global push.autoSetupRemote true
```

Inspect existing keys before creating anything:

```sh
ls -al ~/.ssh
```

If `~/.ssh/id_ed25519` and `~/.ssh/id_ed25519.pub` do not already exist, create a personal-laptop key. Accept the displayed default path and use a passphrase:

```sh
ssh-keygen -t ed25519 -C "YOUR PERSONAL GITHUB EMAIL"
eval "$(ssh-agent -s)"
/usr/bin/ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
```

In GitHub, open **Settings → SSH and GPG keys → New SSH key**, label it `Personal laptop`, and paste the copied public key. Then verify the connection:

```sh
ssh -T git@github.com
```

## Work laptop

Run the same Git defaults with the name and email that the work GitHub account or organization expects:

```sh
git --version
git config --global user.name "YOUR NAME"
git config --global user.email "YOUR WORK GITHUB EMAIL"
git config --global init.defaultBranch main
git config --global pull.ff only
git config --global fetch.prune true
git config --global push.autoSetupRemote true
```

Inspect existing keys first. If the default Ed25519 key does not exist, create a new key on this laptop; do not transfer the personal laptop’s private key:

```sh
ls -al ~/.ssh
ssh-keygen -t ed25519 -C "YOUR WORK GITHUB EMAIL"
eval "$(ssh-agent -s)"
/usr/bin/ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
```

Add that public key to the appropriate GitHub account as `Work laptop`. If the organization enforces SAML SSO, authorize the key for the organization from the key’s GitHub settings page. Then test it:

```sh
ssh -T git@github.com
```

## Keep the key available after restarting

On each laptop, create the SSH client config if it is missing, then open it in TextEdit:

```sh
touch ~/.ssh/config
chmod 600 ~/.ssh/config
open -e ~/.ssh/config
```

Keep any existing entries and add this block once:

```text
Host github.com
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519
```

If the key has no passphrase, omit `UseKeychain yes`. GitHub documents this macOS Keychain setup in [Generating a new SSH key and adding it to the ssh-agent](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

## Clone and use the repository

Run this on each laptop after its SSH test succeeds:

```sh
git clone git@github.com:OWNER/REPOSITORY.git
cd REPOSITORY
git remote -v
git status
```

The normal edit-and-push sequence is:

```sh
git pull --ff-only
git add PATHS-YOU-CHANGED
git commit -m "VERSION - Describe the completed change"
git push origin main
```

Before the first push, confirm `git status` lists only intentional files. Never paste a GitHub token or an SSH private key into a repository, command, issue, or chat.

## Existing key or authentication trouble

Do not rerun `ssh-keygen` over an existing key. Load the existing key and copy its public half instead:

```sh
eval "$(ssh-agent -s)"
/usr/bin/ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
ssh-add -l
ssh -vT git@github.com
```

GitHub normally answers a successful `ssh -T` test with an authentication-success message and notes that shell access is unavailable. That final note—and exit status 1—is expected, as described in [Testing your SSH connection](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection).
