export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const data = req.body.data;
  const filename = req.body.filename || 'memorymap_backup.json';

  if (!data) {
    return res.status(400).send('No data provided');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).send(data);
}
