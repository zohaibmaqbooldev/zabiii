export interface Profile {
  id: string;
  name: string | null;
  title: string | null;
  headline: string | null;
  bio: string | null;
  about: string | null;
  profile_image: string | null;
  about_image_url: string | null;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  github: string | null;
  linkedin: string | null;
  website: string | null;
  education_label: string | null;
  focus: string | null;
  goal: string | null;
  updated_at?: string | null;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  image: string | null;
  image_path: string | null;
  technologies: string[] | null;
  category: string | null;
  github_url: string | null;
  live_url: string | null;
  featured: boolean;
  published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  proficiency: number | null;
  icon: string | null;
  display_order: number;
  visible: boolean;
}

export interface Education {
  id: string;
  degree: string;
  institution: string | null;
  field: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  display_order: number;
  visible: boolean;
}

export interface Certificate {
  id: string;
  title: string;
  issuer: string | null;
  issue_date: string | null;
  image: string | null;
  image_path: string | null;
  credential_url: string | null;
  display_order: number;
  visible: boolean;
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  icon: string | null;
  display_order: number;
  visible: boolean;
}

export interface Experience {
  id: string;
  company: string;
  position: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  technologies: string[] | null;
  company_url: string | null;
  display_order: number;
  visible: boolean;
}

export interface PortfolioData {
  profile: Profile | null;
  projects: Project[];
  skills: Skill[];
  education: Education[];
  certificates: Certificate[];
  socials: SocialLink[];
  experience: Experience[];
}

export const PROFICIENCY_LABELS: Record<number, string> = {
  1: 'Learning',
  2: 'Familiar',
  3: 'Comfortable',
  4: 'Proficient',
  5: 'Advanced',
};
