# Contributing to LiveBooks Desktop

LiveBooks Desktop is a fork of [Frappe Books](https://github.com/frappe/books). Thank you for helping improve it.

## Who to contact

| Audience                                                   | Channel                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Developers** (bugs, ideas, pull requests)                | [GitHub Issues](https://github.com/Mencarii/LiveBooks-Desktop/issues) in this repository, and the guidelines below. |
| **End users** (using the product, not hacking on the repo) | Email **[ben.cheng@mencarii.com](mailto:ben.cheng@mencarii.com)**                                                   |

## Forks, tweaks, and unofficial builds

LiveBooks Desktop is open source under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`). You may study, modify, and redistribute the software under that license.

**Mencarii / LiveBooks is not responsible** for binaries or deployments you build or run yourself, including modified forks. Those are **at your own risk**: no warranty, no obligation of support, and we do not treat them as the supported “LiveBooks” product unless we publish them. If you ship a derivative, comply with **AGPL-3.0-only** and preserve **upstream notices** (see `NOTICE` and `LICENSE`).

Suggestions and patches for **this** repository are welcome via Issues and PRs.

---

## Contributing without code

- **Report issues** using [GitHub Issues](https://github.com/Mencarii/LiveBooks-Desktop/issues) (bugs, confusing UX, documentation gaps).
- **Translations, upstream community, and credits** live with the original project—see **[github.com/frappe/books](https://github.com/frappe/books)** (README and wiki).

---

## Contributing code

**Local setup:** clone [Mencarii/LiveBooks-Desktop](https://github.com/Mencarii/LiveBooks-Desktop), then follow **Development setup** in the root `README.md` (`yarn`, `yarn dev`, `yarn build`).

If you want to contribute code to LiveBooks Desktop, please go through the following sections for tips and guidelines (inherited from upstream Frappe Books):

- [Code Quality](#code-quality)
- [Contributing Features](#contributing-features)
  - [Invisible until required](#invisible-until-required)
  - [Simple UI](#simple-ui)
  - [Documentation and Tests](#documentation-and-tests)
  - [PR Description](#pr-description)
- [Writing Tests](#writing-tests)

## Code Quality

A few rules of thumb to ensure that you're contributing maintainable code:

- **Readability over succinctness**: If your succinct code takes longer to parse (as
  in read and understand) then it is bad code because we aren’t playing code
  golf.
  - **Write short functions** such that the name of the function accurately describes
    what the function does.
  - **Use early exits** ([reference](https://softwareengineering.stackexchange.com/questions/18454/should-i-return-from-a-function-early-or-use-an-if-statement)).
  - **Don’t nest conditionals and loops**. If you find the need for
    nested loops or conditionals, wrap the inner loop or conditional in a function
    and call it in the outer code block.
  - In general, understand why chunking and naming information is helpful when it
    comes to comprehension.
- **Succinctness over readability only if it is significantly more performant**:
  For example, if your code goes from `O(n)` to `O(log(n))` then it’s okay to
  sacrifice readability. In such a case, add comments that mention what is going
  on.
- **Don't Write comments**: Variable names, function names and easy to read code
  should do what a comment would.
- **Write comments only if the code can't be explained by its context** such as
  if the code is esoteric for the sake of performance.
- **Rebase don't merge**: Merge commits are ugly and should be used only to
  merge a large PR.
- **Format your code**: This project uses `prettier` and `eslint` rules for code
  styling and linting, please make sure you have run them and fixed your code
  accordingly before pushing.
- **Use TypeScript**: Even the `*.vue` files should use TypeScript ([reference](https://vuejs.org/guide/typescript/overview.html#usage-in-single-file-components)).

## Contributing Features

When contributing features, these points should be ensured:

### Invisible until Required

We strive to make LiveBooks Desktop as easy and simple to use as possible, and
Progressive Disclosure is one of the design patterns that enables us to do this.

- **Big Features**: ensure that the feature should be hidden using feature
  flags unless needed by majority users. Example: inventory features are
  hidden until _Enable Inventory_ is checked in the Settings.
- **Small Features**: ensure that they stay hidden until needed until the
  context is relevant. Example: extra fields in the Invoice Items table aren't
  shown unless the User clicks on the Edit Row button.

Added feature should not silently alter existing functionality until the user is
aware of it.

### Simple UI

A few rules of thumb to follow if your contributions alters the UI.

- Do not crowd the UI.
- Ensure even spacing, most spacing and sizes are an even multiple of `1rem`.
- Ensure vertical and horizontal alignment. For text ensure vertical baseline
  alignment.
- Simple Labels, ideally just a single word. Avoid overflow and word-breaks.
- Child tables should have at most 5 columns. Extra columns should should be
  jadded to the row edit form.

This website:
[anthonyhobday.com/sideprojects/saferules](https://anthonyhobday.com/sideprojects/saferules/)
contains several safe rules to follow. If you're unsure of your design go
through the list. Do not break them without judgement.

### Documentation and Tests

We know documentation and tests are boring, but they're important and we need
you to add them for large changes.

- **Documentation**: If the feature needs user-facing explanation, update **this** repo’s `README` or add focused docs under the repo where appropriate. For anything that tracks upstream behavior or docs, read **[frappe/books](https://github.com/frappe/books)** and link related upstream changes in your PR if helpful.
- **Tests**: If your features alters business logic then tests should be added.

### PR Description

All pull requests should have a meaningful and detailed description. The following things should be in mentioned in the description:

- **What the change is** should be described in sufficient detail, _not_ a
  single line such as _"This PR adds `[some_feature]`"_.
- **Screenshots** should be added if the change affects the UI.

## Writing Tests

You should write tests. If your features alter business logic and there are no
tests then it is imperative to write tests.

Here are a few rules of thumb to ensure that the tests you're writing are meaningful:

- **Test values that should have changed against expected change.** If values
  after an operation are not as expected, the tests should fail.
- **Test values that shouldn’t have changed.** If values which shouldn’t have
  changed also change, the test should fail.
- **Don’t alter previously written tests,** unless they’re failing due to changes
  in implementation.
- **Don’t write tests for code that has already been tested,** unless you have
  reason to believe that they could have changed.
- **Manually test your changes using the UI atleast once**.
- Don’t write tests for the sake of writing tests.
- Don’t write tests just cause you aren’t sure how something executes.
- Write tests cause you want to ensure that something continues to execute in
  the way you intend for it to be executed.
- Write tests cause manually clicking through the UI to check your changes is
  time-consuming and not feasibly repeatable.
- Write tests to catch unaccounted-for edge cases, then write code to account
  for those edge cases.
