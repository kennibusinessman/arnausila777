/** Зеркало backend/app/schemas/settings.py */

export interface SettingsRead {
  /** Цена сырья (полипропилен) за кг, ₸. */
  raw_price_per_kg: string;
}

export interface SettingsUpdate {
  raw_price_per_kg: string;
}
