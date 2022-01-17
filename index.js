#!/usr/bin/env node
/* jshint esversion: 6 */

const program = require("commander");
const co = require("co");
const prompt = require("co-prompt");
const { Octokit } = require("@octokit/rest");
const { throttling } = require("@octokit/plugin-throttling");
const { importFile } = require("./import.js");
const { exportIssues } = require("./export.js");
const { exitOverride } = require("commander");

program
  .version(require('./package.json').version)
  .arguments("[file]")
  .option(
    "-g, --github_enterprise [https://api.github.my-company.com]",
    "Your GitHub Enterprise URL."
  )
  .option(
    "-t, --token [token]",
    "The GitHub token. https://github.com/settings/tokens"
  )
  .option(
    "-o, --organization [organization]",
    "The User or Organization slug that the repo lives under."
  )
  .option("-r, --repository [repository]", "The repository name (slug).")
  .option("-s, --source [URL]", "For imports, the URL of the repository the issues were exported from")
  .option(
    "-f, --exportFileName [export.csv]",
    "The name of the CSV you'd like to export to."
  )
  .option(
    "-a, --exportAttributes [attributes]",
    "Comma-separated list of attributes (columns) in the export."
  )
  .option("-c, --exportComments", "Include comments in the export.")
  .option("-e, --exportAll", "Include all data in the export.")
  .option("-p, --pause [milliseconds]", "When importing, pause for this time ase after creating an issue or comment (default = 120000")
  .option("-v, --verbose", "Include additional logging information.")
  .action(async function (file, options) {
    co(function* () {
      const retObject = {};
      retObject.githubUrl =
        options.github_enterprise || "https://api.github.com";
      retObject.token = options.token || "";
      if (retObject.token === "") {
        retObject.token = yield prompt(
          "Token (get from https://github.com/settings/tokens): "
        );
      }
      retObject.exportFileName = options.exportFileName || false;
      retObject.exportAttributes = options.exportAttributes || false;
      retObject.sourceURL = options.source || "";
      if (retObject.exportAttributes) {
        retObject.exportAttributes = retObject.exportAttributes
          .split(",")
          .map((i) => i.trim());
      }
      retObject.exportComments = options.exportComments || false;
      retObject.pauseTime = 30000; // 39 seconds (in milliseconds)
      if (options.pause) {
        retObject.pauseTime = parseInt(options.pause);
        if (isNaN(retObject.pauseTime) || retObject.pauseTime < 0) {
          console.error("invalid pause time: %s", options.pause);
          process.exit(-1);
        }
      }
      retObject.exportAll = options.exportAll || false;
      retObject.verbose = options.verbose || false;

      retObject.userOrOrganization = options.organization || "";
      if (retObject.userOrOrganization === "") {
        retObject.userOrOrganization = yield prompt("User or organization: ");
      }

      retObject.repo = options.repository || "";
      if (retObject.repo === "") {
        retObject.repo = yield prompt("Repository: ");
      }
      return retObject;
    }).then(
      function (values) {
        const ThrottledOctokit = Octokit.plugin(throttling);
        const octokit = new ThrottledOctokit({
          auth: values.token,
          userAgent: "github-csv-tools",
          baseUrl: values.githubUrl,
          throttle: {
            onRateLimit: (retryAfter, options) => {
              console.warn(
                `Request quota exhausted for request ${options.method} ${options.url}`
              );

              if (options.request.retryCount === 0) {
                // only retries once
                console.log(`Retrying after ${retryAfter} seconds!`);
                return true;
              }
            },
            onAbuseLimit: (retryAfter, options) => {
              // does not retry, only logs a warning
              console.warn(
                `Abuse detected for request ${options.method} ${options.url}`
              );
            },
          },
        });

        if (file) {
          // This is an import!
          importFile(octokit, file, values);
        } else {
          // this is an export!
          exportIssues(octokit, values);
        }
      },
      function (err) {
        console.error("ERROR", err);
      }
    );
  })
  .parse(process.argv);
