const ALLOWED_ORIGINS = [
  'https://sendabikes.com',
  'https://www.sendabikes.com'
];

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, name } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email.' });
  }

  try {
    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': 'Bearer ' + process.env.ML_TOKEN
      },
      body: JSON.stringify({
        email,
        fields: { name: name || '' },
        groups: [process.env.ML_GROUP]
      })
    });

    if (mlRes.ok || mlRes.status === 201) {
      return res.status(200).json({ ok: true });
    }

    const data = await mlRes.json();
    return res.status(400).json({ error: data.message || 'Subscription failed.' });
  } catch {
    return res.status(500).json({ error: 'Network error — please try again.' });
  }
}
