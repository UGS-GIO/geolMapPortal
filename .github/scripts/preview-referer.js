// CI helper: maintain the `previewReferers` allowlist (one doc per open PR) that the
// getArcGISToken function reads to grant secured-layer tokens to open PRs' preview channels.
//   node preview-referer.js add <prNumber> <channelUrl>
//   node preview-referer.js remove <prNumber>
// Auth: GOOGLE_APPLICATION_CREDENTIALS must point to a prod service-account key.
const admin = require('firebase-admin');
admin.initializeApp();

const [, , action, pr, url] = process.argv;
if (!action || !pr) {
  console.error('usage: preview-referer.js <add|remove> <prNumber> [channelUrl]');
  process.exit(1);
}

const ref = admin.firestore().collection('previewReferers').doc(String(pr));

(async () => {
  if (action === 'add') {
    if (!url) { console.error('add requires a channelUrl'); process.exit(1); }
    await ref.set({
      url: url.replace(/\/+$/, ''),
      pr: Number(pr),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('allowlisted preview channel for PR', pr, '->', url);
  } else if (action === 'remove') {
    await ref.delete(); // idempotent: deleting a missing doc is a no-op
    console.log('removed preview-channel allowlist entry for PR', pr);
  } else {
    console.error('unknown action:', action);
    process.exit(1);
  }
})().catch((err) => { console.error(err); process.exit(1); });
