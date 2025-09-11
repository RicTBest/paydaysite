import { calculateWeeklyScores } from '../../lib/scoring'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { season, week } = req.body

  try {
    await calculateWeeklyScores(season, week)
    res.status(200).json({ message: 'Scores updated successfully' })
  } catch (error) {
    console.error('Error updating scores:', error)
    res.status(500).json({ message: 'Error updating scores' })
  }
}