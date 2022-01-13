async function createIssue (octokit, issueInfo, state = false) {
  const res = await octokit.issues.create(issueInfo);
  if (res.status === 201) { // Success creating the issue.
    if (state !== false) {
      // We need to close it.
      const issueNumber = res.data.number;
      const editres = await octokit.issues
              .update({
                owner: issueInfo.owner,
                repo: issueInfo.repo,
                issue_number: issueNumber,
                state,
              });
       return editres;
    }
  }
  return res;
};

module.exports = { createIssue };
