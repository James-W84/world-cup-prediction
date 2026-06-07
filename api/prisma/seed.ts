import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 2026 FIFA World Cup - 48 teams, 8 groups of 6 teams
// Total: 120 group stage matches + 31 knockout matches = 151 matches

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  kickoffTime: Date;
  stage: 'GROUP' | 'ROUND_OF_16' | 'QF' | 'SF' | 'FINAL';
}

// Generate World Cup 2026 matches
// Note: Using placeholder dates (June-July 2026)
const generateMatches = (): MatchData[] => {
  const matches: MatchData[] = [];

  // GROUP STAGE (120 matches)
  // 8 groups (A-H), 6 teams per group, each plays 3 matches
  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  
  // Placeholder team assignments for each group
  const groupTeams: Record<string, string[]> = {
    A: ['Argentina', 'Uruguay', 'Paraguay', 'Bolivia', 'Chile', 'Colombia'],
    B: ['Brazil', 'Mexico', 'Peru', 'Ecuador', 'Jamaica', 'Curacao'],
    C: ['France', 'Belgium', 'Netherlands', 'Austria', 'Czech Republic', 'Ukraine'],
    D: ['Germany', 'Spain', 'Portugal', 'Poland', 'Italy', 'Switzerland'],
    E: ['England', 'Wales', 'Scotland', 'Denmark', 'Sweden', 'Serbia'],
    F: ['Croatia', 'Turkey', 'Greece', 'Romania', 'Bulgaria', 'Hungary'],
    G: ['Japan', 'South Korea', 'Australia', 'Iran', 'Iraq', 'Uzbekistan'],
    H: ['Nigeria', 'Cameroon', 'Morocco', 'Senegal', 'Tunisia', 'Egypt'],
  };

  let groupMatchDate = new Date('2026-06-01T12:00:00Z');

  // Generate all group matches
  groups.forEach((group) => {
    const teams = groupTeams[group];
    
    // Each group has 15 matches (round-robin: C(6,2) = 15)
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          homeTeam: teams[i],
          awayTeam: teams[j],
          kickoffTime: new Date(groupMatchDate),
          stage: 'GROUP',
        });

        // Increment date for next match (some same day, some different)
        groupMatchDate = new Date(groupMatchDate.getTime() + 4 * 60 * 60 * 1000); // 4 hours later
      }
    }
  });

  // KNOCKOUT STAGE (31 matches)
  // Round of 16: 16 matches (dates: June 28-July 5)
  let knockoutDate = new Date('2026-07-01T12:00:00Z');

  const ro16Teams = [
    { home: 'Group A Winner', away: 'Group B Runner-up' },
    { home: 'Group B Winner', away: 'Group A Runner-up' },
    { home: 'Group C Winner', away: 'Group D Runner-up' },
    { home: 'Group D Winner', away: 'Group C Runner-up' },
    { home: 'Group E Winner', away: 'Group F Runner-up' },
    { home: 'Group F Winner', away: 'Group E Runner-up' },
    { home: 'Group G Winner', away: 'Group H Runner-up' },
    { home: 'Group H Winner', away: 'Group G Runner-up' },
    { home: 'Group A Runner-up', away: 'Group B Winner' },
    { home: 'Group C Runner-up', away: 'Group D Winner' },
    { home: 'Group E Runner-up', away: 'Group F Winner' },
    { home: 'Group G Runner-up', away: 'Group H Winner' },
    { home: 'Group B Runner-up', away: 'Group A Winner' },
    { home: 'Group D Runner-up', away: 'Group C Winner' },
    { home: 'Group F Runner-up', away: 'Group E Winner' },
    { home: 'Group H Runner-up', away: 'Group G Winner' },
  ];

  ro16Teams.forEach((match, idx) => {
    matches.push({
      homeTeam: match.home,
      awayTeam: match.away,
      kickoffTime: new Date(knockoutDate.getTime() + idx * 6 * 60 * 60 * 1000),
      stage: 'ROUND_OF_16',
    });
  });

  // Quarterfinals: 8 matches
  let qfDate = new Date('2026-07-10T12:00:00Z');
  for (let i = 0; i < 8; i++) {
    matches.push({
      homeTeam: `QF Winner ${i * 2 + 1}`,
      awayTeam: `QF Winner ${i * 2 + 2}`,
      kickoffTime: new Date(qfDate.getTime() + i * 8 * 60 * 60 * 1000),
      stage: 'QF',
    });
  }

  // Semifinals: 4 matches
  let sfDate = new Date('2026-07-18T12:00:00Z');
  for (let i = 0; i < 4; i++) {
    matches.push({
      homeTeam: `SF Winner ${i * 2 + 1}`,
      awayTeam: `SF Winner ${i * 2 + 2}`,
      kickoffTime: new Date(sfDate.getTime() + i * 12 * 60 * 60 * 1000),
      stage: 'SF',
    });
  }

  // Third-place playoff: 1 match
  matches.push({
    homeTeam: 'SF Loser 1',
    awayTeam: 'SF Loser 2',
    kickoffTime: new Date('2026-07-26T12:00:00Z'),
    stage: 'SF', // This is technically a playoff, but we'll classify as SF for now
  });

  // Final: 1 match
  matches.push({
    homeTeam: 'Final Team A',
    awayTeam: 'Final Team B',
    kickoffTime: new Date('2026-07-28T16:00:00Z'),
    stage: 'FINAL',
  });

  return matches;
};

async function seed() {
  try {
    console.log('🌱 Starting World Cup 2026 data seeding...');

    // Check if matches already exist
    const existingMatches = await prisma.match.count();
    
    if (existingMatches > 0) {
      console.log(`✓ Matches already exist (${existingMatches}). Skipping seed.`);
      return;
    }

    const matchesData = generateMatches();
    console.log(`📊 Generated ${matchesData.length} matches for World Cup 2026`);

    // Insert all matches
    const created = await prisma.match.createMany({
      data: matchesData,
    });

    console.log(`✓ Successfully created ${created.count} matches`);
    console.log(`  - Group stage: ${matchesData.filter(m => m.stage === 'GROUP').length} matches`);
    console.log(`  - Round of 16: ${matchesData.filter(m => m.stage === 'ROUND_OF_16').length} matches`);
    console.log(`  - Quarterfinals: ${matchesData.filter(m => m.stage === 'QF').length} matches`);
    console.log(`  - Semifinals: ${matchesData.filter(m => m.stage === 'SF').length} matches`);
    console.log(`  - Final: ${matchesData.filter(m => m.stage === 'FINAL').length} match`);
    
    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
