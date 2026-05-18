import * as XLSX from 'xlsx';

export function parseLinkedInExport(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // TOP POSTS — two sets of columns side by side
  const topPostsSheet = workbook.Sheets['TOP POSTS'];
  const rows = XLSX.utils.sheet_to_json(topPostsSheet, { header: 1, defval: '' });

  const posts = {};
  // Skip first 2 header rows
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    // Left side: by engagement (cols 0,1,2)
    if (row[0] && row[0].toString().includes('linkedin.com')) {
      const url = row[0].toString().trim();
      if (!posts[url]) posts[url] = { url };
      posts[url].engagements = parseInt(row[2]) || 0;
      posts[url].publish_date = row[1]
        ? new Date(row[1]).toISOString().split('T')[0]
        : null;
    }
    // Right side: by impressions (cols 4,5,6)
    if (row[4] && row[4].toString().includes('linkedin.com')) {
      const url = row[4].toString().trim();
      if (!posts[url]) posts[url] = { url };
      posts[url].impressions = parseInt(row[6]) || 0;
      if (!posts[url].publish_date && row[5]) {
        posts[url].publish_date = new Date(row[5]).toISOString().split('T')[0];
      }
    }
  }

  // ENGAGEMENT sheet — daily data
  const engSheet = workbook.Sheets['ENGAGEMENT'];
  const engRows = XLSX.utils.sheet_to_json(engSheet, { header: 1, defval: '' });
  const dailyEngagement = [];
  for (let i = 1; i < engRows.length; i++) {
    const row = engRows[i];
    if (row[0] && row[1]) {
      dailyEngagement.push({
        date: new Date(row[0]).toISOString().split('T')[0],
        impressions: parseInt(row[1]) || 0,
        engagements: parseInt(row[2]) || 0,
      });
    }
  }

  // DISCOVERY — totals
  const discSheet = workbook.Sheets['DISCOVERY'];
  const discRows = XLSX.utils.sheet_to_json(discSheet, { header: 1, defval: '' });
  let totalImpressions = 0;
  let membersReached = 0;
  for (const row of discRows) {
    if (row[0] === 'Impressions') totalImpressions = parseInt(row[1]) || 0;
    if (row[0] === 'Members reached') membersReached = parseInt(row[1]) || 0;
  }

  // FOLLOWERS — total
  const follSheet = workbook.Sheets['FOLLOWERS'];
  const follRows = XLSX.utils.sheet_to_json(follSheet, { header: 1, defval: '' });
  let totalFollowers = 0;
  if (follRows[0] && follRows[0][1]) totalFollowers = parseInt(follRows[0][1]) || 0;

  return {
    posts: Object.values(posts),
    dailyEngagement,
    totals: { totalImpressions, membersReached, totalFollowers },
  };
}
