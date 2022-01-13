const csv = require("csv");
const fs = require("fs");

const { createIssue } = require("./helpers.js");

async function importFile(octokit, file, values) {
  const parser = fs.createReadStream(file, "utf8").pipe(csv.parse({ trim : true}));
  let titleIndex, bodyIndex, labelsIndex, milestoneIndex, assigneeIndex, stateIndex;
  let successes = 0;
  let failures = 0;
  let count = 0;
  for await (const row of parser) {
    count++;
    if (count === 1) {
      const header = row.map(col => col.toLowerCase());
      // get indexes of the fields we need
      titleIndex = header.indexOf("title");
      bodyIndex = header.indexOf("body");
      labelsIndex = header.indexOf("labels");
      milestoneIndex = header.indexOf("milestone");
      assigneeIndex = header.indexOf("assignee");
      stateIndex = header.indexOf("state");
      console.log("state index", stateIndex);

      if (titleIndex === -1) {
        console.error("Title required by GitHub, but not found in CSV.");
        process.exit(1);

      }
      continue;
    }

    const sendObj = {
      owner: values.userOrOrganization,
      repo: values.repo,
      title: row[titleIndex],
    };

    // if we have a body column, pass that.
    if (bodyIndex > -1) {
      sendObj.body = row[bodyIndex];
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

    // console.log("sendObj", sendObj);
    const cr = await createIssue(octokit, sendObj, state);
    if (cr.status == 200 || cr.status === 201)
      successes += 1;
    else
      failures += 1;
    // Wait 5 seconds to avoid GitHub secondary throttling.
    await new Promise((resolve, reject) => setTimeout(resolve, 5000));  
  }

  console.log(
    `Created ${successes} issues, and had ${failures} failures.`
  );
  console.log(
    "❤ ❗ If this project has provided you value, please ⭐ star the repo to show your support: ➡ https://github.com/gavinr/github-csv-tools"
  );

  if (failures > 0) {
    console.log(failures);
  }
  process.exit(0);
}

module.exports = { importFile };
