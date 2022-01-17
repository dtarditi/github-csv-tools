const csv = require("csv");
const fs = require("fs");
const { isBooleanObject } = require("util/types");

const { createIssue } = require("./helpers.js");

async function importFile(octokit, file, values) {
  const parser = fs.createReadStream(file, "utf8").pipe(csv.parse({ trim : true}));
  let titleIndex, bodyIndex, labelsIndex, milestoneIndex, assigneeIndex, stateIndex;
  let commentUserIndex = -1, commentCreatedAtIndex = -1, commentBodyIndex = -1;
  let hasComments = false;
  let issueSuccesses = 0;
  let issueFailures = 0;
  let commentSuccesses = 0;
  let commentFailures = 0;
  let count = 0
  // map existing issue numbers to new issue numbers
  const newIssueNumbers  = new Map();
  for await (const row of parser) {
    count++;
    if (count === 1) {
      const header = row.map(col => col.toLowerCase());
      // get indexes of the fields we need
     if (header.indexOf("issue.title") > -1) {
      // The CSV file includes comments
       hasComments = true;
       numberIndex = header.indexOf("issue.number");
       titleIndex = header.indexOf("issue.title");
       bodyIndex = header.indexOf("issue.body");
       labelsIndex = header.indexOf("issue.labels");
       milestoneIndex = header.indexOf("issue.milestone");
       assigneeIndex = header.indexOf("issue.assignee");
       stateIndex = header.indexOf("issue.state");
       commentUserIndex = header.indexOf("comment.user");
       commentCreatedAtIndex = header.indexOf("comment.created_at");
       commentBodyIndex = header.indexOf("comment.body");
      } else {
        // The CSV file does not include comments.
        numberIndex = header.indexOf("number");
        titleIndex = header.indexOf("title");
        bodyIndex = header.indexOf("body");
        labelsIndex = header.indexOf("labels");
        milestoneIndex = header.indexOf("milestone");
        assigneeIndex = header.indexOf("assignee");
        stateIndex = header.indexOf("state");
      }

      if (titleIndex === -1) {
        console.error("Title required by GitHub, but not found in CSV.");
        process.exit(1);
      }

      if (hasComments && numberIndex === -1) {
        console.error("Importing comments requires issue number, but not found in CSV");
        process.exit(1);
      }
      continue;
    }

    // Gather the data for creating an issue.  Both issue and comment
    // rows in the CSV include this data.
    const sendObj = {
      owner: values.userOrOrganization,
      repo: values.repo,
      title: row[titleIndex],
    };

    let issueNumber = -1;
    if (numberIndex > -1) {
      issueNumber = row[numberIndex];
    }

    // if we have a body column, pass that.
    if (bodyIndex > -1) {
      let body = row[bodyIndex];
      if (issueNumber >= 1 && values.source !== "") {
        body = "This issue was copied from " + values.sourceURL + "/issues/" +
          issueNumber + "\n\n----\n" + body;
      }
      sendObj.body = body;
    }

    // if we have a labels column, pass that.
    if (labelsIndex > -1 && row[labelsIndex] !== "") {
      sendObj.labels = row[labelsIndex].split(",");
    }

    // if we have a milestone column, pass that.
    if (milestoneIndex > -1 && row[milestoneIndex] !== "") {
      sendObj.milestone = row[milestoneIndex];
    }

    // if we have an assignee column, pass that.
    if (assigneeIndex > -1 && row[assigneeIndex] !== "") {
      sendObj.assignees = row[assigneeIndex].replace(/ /g, "").split(",");
    }

    let state = false;
    if (stateIndex > -1 && row[stateIndex] === "closed") {
      state = row[stateIndex];
    }

    let isIssue = !hasComments || row[commentCreatedAtIndex] === "";
    if (isIssue) {
      const cr = await createIssue(octokit, sendObj, state);
      if (hasComments && (cr.status === 200 || cr.status === 201)) {
        newIssueNumbers.set(issueNumber, cr.data.number);
      }
      if (cr.status === 200 || cr.status === 201)
        issueSuccesses += 1;
      else
        issueFailures += 1;
    } else {
      const commentObj = {
        owner: values.userOrOrganization,
        repo: values.repo,
      }
      if (newIssueNumbers.has(issueNumber)) {
        commentObj.issue_number  = newIssueNumbers.get(issueNumber);
        if (commentBodyIndex > -1 && row[commentBodyIndex] !== "") {
          let commentBody = row[commentBodyIndex];
          if (commentUserIndex > -1 && row[commentUserIndex] !== "")
            commentBody = "Comment from @" + row[commentUserIndex] + ":\n\n" + commentBody;
          commentObj.body = commentBody;
          const cr = await octokit.issues.createComment(commentObj);
          if (cr.status === 200 || cr.status === 201)
            commentSuccesses += 1;
          else
            commentFailures += 1;
        }
      }
    }
    // Wait to avoid GitHub secondary throttling.
    await new Promise((resolve, reject) => setTimeout(resolve, values.pauseTime));
  }

  console.log(
    `Created ${issueSuccesses} issues, and had ${issueFailures} failures.`
  );
  console.log(
    `Created ${commentSuccesses} comments, and had ${commentFailures} failures.`
  );
  console.log(
    "❤ ❗ If this project has provided you value, please ⭐ star the repo to show your support: ➡ https://github.com/gavinr/github-csv-tools"
  );

  if (issueFailures > 0) {
    console.log(issueFailures);
  }
  process.exit(0);
}

module.exports = { importFile };
