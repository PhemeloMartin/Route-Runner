export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'welcome', title: 'Day One', description: 'Started the Route Runner journey.', icon: '🚀', xp: 20 },
  { id: 'first-lesson', title: 'First Steps', description: 'Completed your first lesson.', icon: '📘', xp: 20 },
  { id: 'ten-lessons', title: 'Getting Serious', description: 'Completed 10 lessons.', icon: '📚', xp: 60 },
  { id: 'fifty-lessons', title: 'Half Century', description: 'Completed 50 lessons.', icon: '🏏', xp: 200 },
  { id: 'all-streams', title: 'Triple Threat', description: 'Completed a lesson in Network, Cloud AND Forex.', icon: '🔱', xp: 80 },
  { id: 'perfect-quiz', title: 'Flawless', description: 'Scored 100% on a quiz.', icon: '💯', xp: 30 },
  { id: 'first-boss', title: 'Boss Slayer', description: 'Defeated your first chapter boss.', icon: '🐉', xp: 80 },
  { id: 'first-lab', title: 'Hands Dirty', description: 'Completed your first hands-on lab.', icon: '🛠️', xp: 50 },
  { id: 'five-labs', title: 'Lab Rat', description: 'Completed 5 labs.', icon: '🧪', xp: 120 },
  { id: 'capstone', title: 'Phemelo Corp Online', description: 'Completed the network capstone.', icon: '🏢', xp: 500 },
  { id: 'troubleshooter', title: 'Ticket Closer', description: 'Solved a troubleshooting ticket.', icon: '🎫', xp: 80 },
  { id: 'streak-3', title: 'Warming Up', description: '3-day learning streak.', icon: '🔥', xp: 30 },
  { id: 'streak-7', title: 'One Week Strong', description: '7-day learning streak.', icon: '🔥', xp: 100 },
  { id: 'streak-30', title: 'Habit Formed', description: '30-day learning streak.', icon: '🌋', xp: 400 },
  { id: 'streak-90', title: 'Three Months of Fire', description: '90-day learning streak - the whole programme!', icon: '👑', xp: 1500 },
  { id: 'subnet-25', title: 'Subnet Sniper', description: 'Answered 25 subnetting drills correctly.', icon: '🎯', xp: 100 },
  { id: 'subnet-100', title: 'Binary Brain', description: 'Answered 100 subnetting drills correctly.', icon: '🧠', xp: 300 },
  { id: 'flashcards-100', title: 'Memory Palace', description: 'Reviewed 100 flashcards.', icon: '🗂️', xp: 100 },
  { id: 'interview-10', title: 'Smooth Talker', description: 'Practised 10 interview answers out loud.', icon: '🎤', xp: 80 },
  { id: 'exam-pass', title: 'Exam Ready', description: 'Scored 82%+ on a CCNA mock exam.', icon: '🎓', xp: 300 },
  { id: 'exam-90', title: 'Distinction', description: 'Scored 90%+ on a CCNA mock exam.', icon: '🏆', xp: 500 },
  { id: 'first-trade', title: 'Market Entry', description: 'Placed your first paper trade.', icon: '📈', xp: 20 },
  { id: 'disciplined-10', title: 'Risk Manager', description: '10 closed trades, each with a stop-loss and <=2% risk.', icon: '🛡️', xp: 200 },
  { id: 'journal-20', title: 'Trader\'s Diary', description: 'Journaled 20 trades with setup and emotion.', icon: '📓', xp: 150 },
  { id: 'rack-perfect', title: 'Cable Monk', description: 'Built a rack that passes every best-practice rule.', icon: '🗄️', xp: 120 },
  { id: 'pc-built', title: 'Builder', description: 'Assembled a PC in the Workshop.', icon: '🖥️', xp: 60 },
  { id: 'night-owl', title: 'Night Owl', description: 'Studied after 22:00 SAST.', icon: '🦉', xp: 15 },
  { id: 'early-bird', title: 'Early Bird', description: 'Studied before 07:00 SAST.', icon: '🐦', xp: 15 },
];

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
