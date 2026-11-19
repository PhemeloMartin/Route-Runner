import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d02 | Git and Teamwork: Version Control Like a Pro | 2
@sources Pro Git (git-scm.com/book, free); GitHub Docs - pull requests and branch protection; Atlassian Git tutorials; trunkbaseddevelopment.com
@story
Lindiwe hired a second developer, Sipho. On day two he overwrote Phemelo's work by copying a folder over a shared drive. "Never again," says Phemelo. Every professional team - from a 2-person startup in Kimberley to Microsoft - uses Git. It is also the starting point of every DevOps pipeline: a push to Git is what wakes up CI/CD.

=== lesson d02-1 | Commits, Branches and the Three Areas | 25
@analogy Git is a photo album of your project. Every commit is a dated photo with a caption. The staging area is the pile of prints you've chosen for the next page. A branch is a sticky note saying "this storyline continues from this photo" - you can have many storylines and later glue them together.
@objectives
- Explain working directory, staging area and repository
- Use init, status, add, commit, log, diff
- Create, switch and merge branches
@body
Git tracks changes in three areas:
1. **Working directory** - the files you edit.
2. **Staging area (index)** - changes you've chosen with [[git add]] for the next commit.
3. **Repository (.git folder)** - the permanent history of commits.

~~~
git init                          # start tracking this folder
git status                        # what changed? what is staged?
git add Program.cs                # stage one file (git add . stages everything)
git commit -m "Add todo endpoint" # save a snapshot with a message
git log --oneline --graph         # history
git diff                          # unstaged changes; git diff --staged for staged
~~~
Each **commit** has a unique **SHA** (e.g. 4f2a9c1), an author, a date, a message and a pointer to its parent - a chain you can always go back along.

**Branches** are cheap pointers to a commit. [[main]] is the stable line. You work on a **feature branch**:
~~~
git switch -c feature/order-history   # create + switch
... edit, add, commit ...
git switch main
git merge feature/order-history       # bring the work in
git branch -d feature/order-history   # tidy up
~~~
**.gitignore** lists files Git must never track: build output ([[bin/]], [[obj/]], [[build/]]), secrets ([[.env]], [[appsettings.Development.json]] with passwords), local databases ([[*.db]]). **Never commit secrets** - bots scan public GitHub repos for keys within minutes.

**Good commit messages** use the imperative mood and explain *why*: "Fix VAT rounding on orders over R1000", not "stuff". Many teams use **Conventional Commits**: [[feat: add order history]], [[fix: round VAT to 2 decimals]], [[chore: bump EF Core]] - tools can then build changelogs and version numbers automatically.
@terms
- Repository :: The .git database holding every commit of a project
- Working directory :: Your checked-out files where you edit
- Staging area :: Changes selected with git add for the next commit
- Commit :: A saved snapshot with message, author and a unique SHA
- Branch :: A movable pointer to a commit - a separate line of work
- Merge :: Combining the history of two branches
- .gitignore :: List of files Git must not track (build output, secrets)
- Conventional Commits :: Message convention like feat:, fix:, chore: for automated changelogs
@pro
- "I keep main deployable and do all work on short-lived feature branches."
- "Secrets never go into Git - we use user-secrets locally and a secret store in CI."
@interview You accidentally committed a database password to a public GitHub repo. What do you do? :: First, rotate the password immediately - assume it is already stolen, because bots scan GitHub in minutes. Then remove it from the code and from history (git filter-repo or BFG), force-push, and ask GitHub support to purge caches if needed. Finally prevent a repeat: add the file to .gitignore, move secrets to user-secrets or a vault, and enable secret scanning and push protection on the repository.
@lab dev:ci-pipeline | DevOps Mission - commit the pipeline repo and turn it green
@quiz
? What does git add do?
- Saves a commit
+ Moves changes into the staging area for the next commit
- Uploads to GitHub
- Creates a branch
> add stages; commit saves; push uploads.
? Which file stops bin/ and obj/ folders from being committed?
- README.md
+ .gitignore
- .gitkeep
- appsettings.json
> .gitignore lists paths Git ignores.
? Which is the best commit message?
- update
- changes to files
+ fix: round VAT to 2 decimals on order totals
- asdf
> Imperative, specific, explains the change - and follows Conventional Commits.
?= Which git command creates a new branch called feature/login and switches to it? (git switch ...)
= git switch -c feature/login | git checkout -b feature/login
> switch -c (or the older checkout -b) creates and switches in one step.

=== lesson d02-2 | GitHub Flow: Pull Requests, Reviews and Merge Conflicts | 25
@analogy A pull request is handing your draft essay to a classmate before submitting it: they read it, leave comments in the margin, an automatic spell-checker (CI) runs, and only when everyone is happy does it go into the final assignment (main).
@objectives
- Work with remotes: clone, fetch, pull, push
- Describe the pull-request workflow and branch protection
- Resolve a merge conflict calmly
@body
A **remote** is a copy of the repo on a server (GitHub, GitLab, Azure Repos). [[origin]] is the default name.
~~~
git clone https://github.com/phemelo/kasi-market.git
git pull                  # fetch + merge the latest main
git push -u origin feature/order-history   # publish your branch
~~~
**GitHub Flow** (simple and popular):
1. Branch off main.
2. Commit small changes, push.
3. Open a **pull request (PR)** describing *what* and *why*.
4. **CI runs automatically** (build, tests, lint) and teammates **review**.
5. Fix feedback, push again - the PR updates.
6. **Merge** (often *squash merge* = one tidy commit), delete the branch, CD deploys.

**Branch protection** on main enforces the rules: no direct pushes, at least one approving review, all status checks green, branch up to date. This is how a team guarantees main is always deployable.

**Merge conflicts** happen when two branches change the *same lines*. Git can't guess, so it marks the file:
~~~
<<<<<<< HEAD
const decimal VatRate = 0.15m;
=======
const decimal VatRate = 0.16m;
>>>>>>> feature/vat-change
~~~
Decide the correct result (talk to the other developer!), delete the markers, then [[git add]] the file and commit. Small, frequent merges = few conflicts.

**Trunk-based development** goes further: everyone merges small changes to main at least daily, hiding unfinished features behind **feature flags**. High-performing teams in the DORA research overwhelmingly work this way. **GitFlow** (long-lived develop/release branches) is older and heavier - you'll still meet it in banks and enterprises.

Undoing safely: [[git restore file]] (discard edits), [[git revert SHA]] (new commit that undoes an old one - safe on shared branches). Avoid [[git push --force]] on shared branches.
@terms
- Remote :: A copy of the repository on a server; origin is the default name
- Pull request (PR) :: A request to merge a branch, with review and CI checks
- Code review :: Teammates reading and commenting on changes before merge
- Branch protection :: Rules on main: reviews required, checks green, no direct push
- Merge conflict :: Two branches changed the same lines; a human must choose
- Squash merge :: Combining all commits of a PR into one commit on main
- Trunk-based development :: Small changes merged to main at least daily, using feature flags
- Feature flag :: A switch that turns a feature on/off without redeploying
- git revert :: Creates a new commit that undoes an earlier one - safe on shared history
@pro
- "Main is protected: every change goes through a PR with a green pipeline and one approval."
- "We prefer trunk-based development with feature flags, so integration pain never builds up."
@interview How do you handle a merge conflict? :: I don't panic: git status shows the conflicted files, and I open each one to see both versions between the markers. I work out the correct combined result - talking to the other developer if the intent is unclear - remove the markers, build and run the tests, then git add and commit. To avoid conflicts in the first place I keep branches short-lived and pull from main often.
@quiz
? What normally runs automatically when a pull request is opened?
+ CI checks such as build, tests and linting
- A production deployment
- git reset --hard
- Nothing until merge
> PRs trigger CI so reviewers see whether the change builds and passes tests.
? Which command safely undoes a commit that is already on the shared main branch?
- git reset --hard HEAD~1 then force-push
+ git revert <sha>
- git rm -r .
- git commit --amend
> revert adds a new commit; it doesn't rewrite shared history.
? What causes a merge conflict?
- Two people pushing on the same day
+ Two branches changing the same lines of the same file
- A missing .gitignore
- Too many commits
> Git can merge different lines automatically; same lines need a human.
? Branch protection on main typically requires:
+ Pull requests with approving reviews and passing status checks
- Every developer to work directly on main
- Commits only on Fridays
- Force pushes
> It keeps main always deployable.

=== boss
? Which Git area holds changes chosen for the next commit?
- Working directory
+ Staging area (index)
- Remote
- Stash only
> git add moves changes to the staging area.
? A teammate force-pushed over main and history disappeared. Which rule would have prevented it?
- A longer README
+ Branch protection that blocks force pushes and direct pushes to main
- Using Conventional Commits
- A bigger .gitignore
> Protect main.
?? Which belong in .gitignore for an ASP.NET + Flutter repo? (choose all)
+ bin/ and obj/
+ build/ and .dart_tool/
+ files containing secrets such as .env
- Program.cs
> Generated output and secrets stay out of Git.
? What does trunk-based development rely on to merge unfinished work safely?
- Long-lived release branches
+ Feature flags
- Force pushes
- Weekly merges
> Flags hide incomplete features while the code is integrated continuously.
? In GitHub Flow, what happens after a PR is approved and green?
+ It is merged into main and the branch is deleted (and CD can deploy)
- It is emailed to the manager
- It waits for a monthly release branch
- It is rebased onto every other branch
> Merge, delete, deploy.
`;
