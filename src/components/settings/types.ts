import type { AppSettings } from '../../types';

export interface SettingsTabProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}
