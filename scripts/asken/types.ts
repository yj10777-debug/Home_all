export type MealType = '朝食' | '昼食' | '夕食' | '間食';

export interface ScrapedItem {
    mealType: MealType;
    name: string;
    amount: string;
    calories: number;
}

export interface ExerciseData {
    steps: number;       // 歩数
    calories: number;    // 運動消費カロリー
}

export interface DayResult {
    date: string; // YYYY-MM-DD
    items: ScrapedItem[];
    nutrients: Partial<Record<'朝食' | '昼食' | '夕食', Record<string, string>>>;
    exercise?: ExerciseData;
}
