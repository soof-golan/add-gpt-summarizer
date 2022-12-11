#!/usr/bin/env node

import _ from 'lodash';
import chalk from 'chalk';
import chalkAnimation from 'chalk-animation';
import clipboard from 'clipboardy';
import fs from "fs/promises";
import gitRemoteOriginUrl from 'git-remote-origin-url';
import inquirer from 'inquirer';
import open from 'open';
import yargs from 'yargs'
import {createSpinner} from 'nanospinner';
import {hideBin} from 'yargs/helpers'
import simpleGit, {Options as GitOptions} from "simple-git";

const easterEggs = [
  "Skynet initializing",
  "Summoning AI demons",
  "Initializing world takeover",
  "Summoning AI overlords",
  "Initializing mind upload",
]

const actionNameDefault = 'gpt-commit-summarizer';
const args = await yargs(hideBin(process.argv))
  .usage('Add AI powered summarization to your PR in your codebase')
  .option('yes', {
    alias: ['y', 'non-interactive', "nonInteractive"],
    type: 'boolean',
    description: 'Skip the prompts and use the default values',
    default: false
  })
  .option('action-name', {
    alias: ['a', 'actionName'],
    type: 'string',
    description: 'Name of the GitHub Action',
    default: actionNameDefault,
    string: true
  }).option('self-hosted', {
    alias: ['s', 'selfHosted'],
    type: 'boolean',
    description: 'Use self-hosted runners',
    default: false
  }).option('no-browser', {
    alias: ['n', 'noBrowser'],
    type: 'boolean',
    description: 'Do not open the browser to create an OpenAI API Key',
    default: false
  }).option('commit', {
    alias: ['c'],
    type: 'boolean',
    description: 'Commit the changes to the repository',
    default: true
  }).option('push', {
    alias: ['p'],
    type: 'boolean',
    description: 'Push the changes to the repository',
    default: false
  }).option('dry-run', {
    alias: ['d', 'dryRun'],
    type: 'boolean',
    description: 'Do not commit or push the changes to the repository',
    default: false
  })
  // .demandCommand()
  .parse()


const sleep = (ms = 2000) => new Promise((r) => args.yes ? r(null) : setTimeout(r, ms));

async function welcome() {
  const rainbowTitle = chalkAnimation.rainbow(
    '🤖 Harness the power of AI to summarize your PRs'
  );
  await sleep();
  rainbowTitle.stop();
}

const createFile = async (path: string, content: string) => {
  await fs.mkdir(path.split('/').slice(0, -1).join('/'), {recursive: true});
  await fs.writeFile(path, content, {encoding: 'utf8', flag: 'w'});
}

// Create the action file
async function handleActionCreation({actionName, selfHosted}: { actionName: string, selfHosted: boolean }) {
  const githubActionYamlContent = `name: GPT Commits summarizer
# Summary: This action will write a comment about every commit in a pull request, 
# as well as generate a summary for every file that was modified and add it to the
# review page, compile a PR summary from all commit summaries and file diff 
# summaries, and delete outdated code review comments

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  summarize:
    runs-on: ${(selfHosted ? 'self-hosted' : 'ubuntu-latest')}
    permissions: write-all  # Some repositories need this line

    steps:
      - uses: KanHarI/gpt-commit-summarizer@master
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
`

  const spinner = createSpinner(`${chalk.bgRed(_.sample(easterEggs))} (Creating GitHub Action File.)`).start();
  const githubActionPath = `./.github/workflows/${actionName}.yml`;
  try {
    // Simulate a long running task
    await createFile(githubActionPath, githubActionYamlContent);
    await sleep()
    spinner.success({text: `${chalk.bgGreen("SUCCESS")} GitHub Action File Created at: ${githubActionPath}`});
  } catch (e) {
    spinner.error({text: `Failed to create GitHub Action File ${e}`});
  }
  return githubActionPath;
}

// Ask the user for the action name
async function askActionName() {
  return await inquirer.prompt({
    name: 'actionName',
    type: 'input',
    message: 'How should we name the GitHub Action?',
    default: () => 'gpt-commit-summarizer',
    when: () => !args.yes,
  }).then((answers) => answers.actionName ?? args.actionName);
}

// Ask the user for using self-hosted runners
async function askSelfHosted() {
  return await inquirer.prompt({
    name: 'selfHosted',
    type: 'confirm',
    message: 'Do you want to use self-hosted runners?',
    default: () => args.selfHosted,
    when: () => !args.yes,
  }).then((answers) => answers.selfHosted ?? args.selfHosted);
}

// Ask the user to create an OpenAI API Key
async function askCreateOpenAIKey() {
  const target = 'https://beta.openai.com/account/api-keys';

  const createOpenAIKey = await inquirer.prompt({
    name: 'createOpenAIKey',
    type: 'confirm',
    message: `Do you want to create an OpenAI API Key?
 (This will open your browser at ${target})`,
    default: () => !args.noBrowser,
    when: () => !args.yes,
  }).then((answers) => answers.createOpenAIKey ?? !args.noBrowser);
  if (createOpenAIKey) {
    const spinner = createSpinner(`Opening browser to create OpenAI API Key.`).start();
    await sleep();
    spinner.stop();
    console.log(`Please go to ${target} and create a new API Key.
add it to the secret you're creating in your repository and save the secret.`);
    await open(target);
  }
}

// Convert ssh git remote url to https
const useHttps = (url: string) => {
  const noSsh = url.replace(/^git@/, "https://");
  return noSsh.replace(/.git$/, "");
}

async function askGitRemoteUrl(): Promise<string> {
  try {
    // Infer git remote url
    const remoteUrl = await gitRemoteOriginUrl({cwd: process.cwd()});
    return useHttps(remoteUrl)
  } catch (e) {
    // If we can't get the git remote url, ask the user for it
    console.log(`${chalk.bgYellow("WARN")} Failed to get git remote url: ${e}`)
    const repoName: string = await inquirer.prompt({
      name: "githubRepoName",
      type: "input",
      message: "What is the name of your GitHub repository? (e.g. some-user/fluffy-potato)",
      validate: (value) => /^[a-zA-Z-_]+\/[a-zA-Z-]+$/.test(value)
    }).then((answer) => answer.githubRepoName);
    return `https://github.com/${repoName}`;
  }
}

// Ask the user for to open the GitHub Actions secrets page
async function addApiKeysToGitHubRepoSecrets() {
  const remoteUrl = await askGitRemoteUrl();
  const target = `${remoteUrl}/settings/secrets/actions/new`;
  const secretName = "OPENAI_API_KEY";

  const addToSecretsAnswer = await inquirer.prompt({
    name: 'addApiKeysToGitHubRepoSecrets',
    type: 'confirm',
    message: `Do you want to add the OpenAI API Key to your GitHub Actions repository secrets?
 (This will open your browser at ${target})`,
    default: () => !args.noBrowser,
    when: () => !args.yes,
  });
  if (!addToSecretsAnswer.addApiKeysToGitHubRepoSecrets) {
    return
  }
  await clipboard.write(secretName)

  const spinner = createSpinner(
    `The secret name ("${secretName}") has been copied to your clipboard.
Please go to ${target},
paste the secret name and come back here.
(Your browser will open in a few seconds)`
  ).start()
  await sleep(10000);
  await open(target);
  spinner.stop();
}

async function askCommit(githubActionPath: string) {
  const commit = await inquirer.prompt({
    name: 'commit',
    type: 'confirm',
    message: 'Do you want to use the commit your changes?',
    default: () => args.commit,
    when: () => !args.yes,
  }).then((answer) => answer.commit ?? args.commit);
  if (!commit) {
    return
  }

  const spinner = createSpinner().start({
    text: `Committing changes to ${githubActionPath}`,
  });
  await sleep();
  try {
    const options: GitOptions = {};
    if (args.dryRun) {
      _.set(options, "--dry-run", true);
      spinner.warn({text: "Dry run: Not committing changes."})
    }
    await simpleGit().add(githubActionPath);
    await simpleGit({}).commit("Add GitHub Action for AI PR Summarizer", githubActionPath, options);
    spinner.success({text: `${chalk.bgGreen("SUCCESS")} Committed changes to ${githubActionPath}`});
  } catch (e) {
    spinner.error({text: `Failed to commit changes ${e}`});
    process.exit(1);
  }
}

async function askPush() {
  const push = await inquirer.prompt({
    name: 'push',
    type: 'confirm',
    message: 'Do you want to push the changes?',
    default: () => args.push,
    when: () => !args.yes,
  }).then((answer) => answer.push ?? args.push);
  if (!push) {
    return
  }

  const spinner = createSpinner().start({
    text: `↗️ Pushing changes`,
  });
  await sleep();
  try {
    const options: GitOptions = {};
    if (args.dryRun) {
      _.set(options, "--dry-run", true);
      spinner.warn({text: "Dry run: Not pushing changes."})
    }
    await simpleGit().push(options);
    spinner.success({text: `${chalk.bgGreen("SUCCESS")} Pushed changes`});
  } catch (e) {
    spinner.error({text: `Failed to push changes ${e}`});
  }
}

async function main() {
  console.clear();
  await welcome();
  const actionName = await askActionName();
  const selfHosted = await askSelfHosted();
  const githubActionPath = await handleActionCreation({actionName, selfHosted});
  await askCommit(githubActionPath);
  await askPush();
  args.yes || args.noBrowser || await addApiKeysToGitHubRepoSecrets();
  args.yes || args.noBrowser || await askCreateOpenAIKey();
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});

