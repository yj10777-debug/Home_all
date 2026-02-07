export type MealType = '朝食' | '昼食' | '夕食' | '間食';

export interface ScrapedItem {
    mealType: MealType;
    name: string;
    amount: string;
    calories: number;
}

export interface DayResult {
    date: string; // YYYY-MM-DD
    items: ScrapedItem[];
    nutrients: Partial<Record<'朝食' | '昼食' | '夕食', Record<string, string>>>;
}
