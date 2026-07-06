export interface Photo {
  thumb: string;
  full: string;
  isVideo?: boolean;
  qualities?: { url: string; label: string }[];
}

export interface ProfilePost {
  code: string;
  caption: string;
  createdAt: number | null;
  items: Photo[];
}

export interface MediaResult {
  photos?: Photo[];
  videoUrl?: string;
  thumbUrl?: string;
  title?: string;
  description?: string;
  author?: string;
  width?: number;
  height?: number;
  isPhoto?: boolean;
  error?: string;
  type?: "profile";
  profile?: { username: string; profilePicUrl: string };
  posts?: ProfilePost[];
  capped?: boolean;
}

export interface Env {
  ACCOUNTS?: string;
}
