export const generateInviteCode = (length: number = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const calculateRank = (index: number, results: any[]): number => {
  if (index === 0) return 1;
  
  const currentPoints = results[index].totalPoints;
  const prevPoints = results[index - 1].totalPoints;
  
  return currentPoints === prevPoints ? calculateRank(index - 1, results) : index + 1;
};
