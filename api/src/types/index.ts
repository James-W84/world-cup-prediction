export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Augment Express so req.user is the Prisma User shape everywhere
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      username: string;
      avatarUrl: string | null;
      totalPoints: number;
      createdAt: Date;
      updatedAt: Date;
    }
  }
}
