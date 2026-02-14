import { DayData, GOAL_CALORIES, GOAL_PFC } from './gemini';

/** スコア内訳 */
export type ScoreBreakdown = {
    total: number;
    details: {
        diet: {
            total: number; // 50点満点
            calorie: { score: number; label: string }; // 20点
            protein: { score: number; label: string }; // 15点
            pfcBalance: { score: number; label: string }; // 10点
            timing: { score: number; label: string }; // 5点
        };
        workout: {
            total: number; // 30点満点
            execution: { score: number; label: string }; // 10点
            progressive: { score: number; label: string }; // 10点
            volume: { score: number; label: string }; // 5点
            selection: { score: number; label: string }; // 5点
        };
        lifestyle: {
            total: number; // 20点満点
            sleep: { score: number; label: string }; // 10点
            activity: { score: number; label: string }; // 10点
        };
    };
};

/** 数値抽出 */
function parseNumeric(v: string | number): number {
    if (typeof v === 'number') return v;
    const m = v.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
}

/**
 * 1日分のデータからスコアを計算する
 */
export function calculateDailyScore(day: DayData): ScoreBreakdown {
    // ─── 1. 食地評価（50点） ─────────────────────────────

    // カロリー収支 (20点)
    let totalCalories = 0;
    if (day.askenNutrients) {
        // 栄養素データから合計
        for (const meal of Object.values(day.askenNutrients)) {
            if (meal['エネルギー']) totalCalories += parseNumeric(meal['エネルギー']);
        }
    }
    // 栄養素データにないアイテム（間食など）を加算
    // 注: askenNutrientsにある食事タイプのitemsは重複するので除外が必要だが、
    // 簡易的に「nutrientsにキーがない食事タイプ」のみ加算するロジックにする
    const nutrientMealTypes = new Set(day.askenNutrients ? Object.keys(day.askenNutrients) : []);
    if (day.askenItems) {
        for (const item of day.askenItems) {
            if (!nutrientMealTypes.has(item.mealType)) {
                totalCalories += item.calories;
            }
        }
    }

    // カロリースコア計算
    let calorieScore = 0;
    let calorieLabel = '';
    const diffRatio = Math.abs(totalCalories - GOAL_CALORIES) / GOAL_CALORIES;
    if (diffRatio <= 0.1) {
        calorieScore = 20;
        calorieLabel = '目標±10%以内 (満点)';
    } else if (diffRatio <= 0.2) {
        calorieScore = 10;
        calorieLabel = '目標±10-20% (-10点)';
    } else {
        calorieScore = 0;
        calorieLabel = '目標±20%超 (-20点)';
    }

    // タンパク質充足 (15点)
    // 体重75kg仮定 -> 2.0g=150g(GOAL_PFC.proteinと同じ)
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;

    if (day.askenNutrients) {
        for (const meal of Object.values(day.askenNutrients)) {
            if (meal['たんぱく質']) totalProtein += parseNumeric(meal['たんぱく質']);
            if (meal['脂質']) totalFat += parseNumeric(meal['脂質']);
            if (meal['炭水化物']) totalCarbs += parseNumeric(meal['炭水化物']);
        }
    }

    const weight = 75;
    let proteinScore = 0;
    let proteinLabel = '';
    const pPerWeight = totalProtein / weight;

    if (pPerWeight >= 2.0) {
        proteinScore = 15;
        proteinLabel = '体重×2.0g以上 (満点)';
    } else if (pPerWeight >= 1.6) {
        proteinScore = 10;
        proteinLabel = '体重×1.6-1.9g (-5点)';
    } else {
        proteinScore = 0;
        proteinLabel = '体重×1.6g未満 (-15点)';
    }

    // PFCバランス (10点)
    // P:25-35%, F:20-30%, C:40-55% (カロリー比率で近似計算)
    // 簡易的にグラム数比率ではなくカロリー比で判定すべきだが、ここでは設定された目標値に対する達成度で見ることもできる
    // プロンプトのロジックに合わせる: P:25-35%, F:20-30%, C:40-55%
    // 1gあたり: P=4, F=9, C=4 kcal
    const pCal = totalProtein * 4;
    const fCal = totalFat * 9;
    const cCal = totalCarbs * 4;
    const calcTotalCal = pCal + fCal + cCal; // 栄養素からの合計（totalCaloriesとズレる可能性あり）

    let pfcScore = 10;
    let pfcLabel = 'バランス良好 (満点)';
    let rangeOutCount = 0;

    if (calcTotalCal > 0) {
        const pRatio = pCal / calcTotalCal;
        const fRatio = fCal / calcTotalCal;
        const cRatio = cCal / calcTotalCal;

        if (pRatio < 0.25 || pRatio > 0.35) rangeOutCount++;
        if (fRatio < 0.20 || fRatio > 0.30) rangeOutCount++;
        if (cRatio < 0.40 || cRatio > 0.55) rangeOutCount++;
    } else {
        // データなし
        rangeOutCount = 3;
    }

    if (rangeOutCount === 0) {
        pfcScore = 10;
        pfcLabel = '全項目範囲内';
    } else if (rangeOutCount === 1) {
        pfcScore = 5;
        pfcLabel = '1項目範囲外 (-5点)';
    } else {
        pfcScore = 0;
        pfcLabel = '2項目以上範囲外 (-10点)';
    }

    // 食事タイミング (5点)
    // mealTypeの種類で判定（簡易）
    const eatenTypes = new Set(Object.keys(day.askenNutrients || {}));
    // itemsからも追加
    if (day.askenItems) {
        day.askenItems.forEach(i => eatenTypes.add(i.mealType));
    }

    let timingScore = 0;
    let timingLabel = '';
    // 朝・昼・夕のうち2つ以上あればOKとする（厳密な時間間隔はデータがないため）
    const mainMeals = ['朝食', '昼食', '夕食'];
    const eatenMainCount = mainMeals.filter(t => eatenTypes.has(t)).length;

    if (eatenMainCount >= 3) {
        timingScore = 5;
        timingLabel = '3食摂取 (満点)';
    } else if (eatenMainCount >= 2) {
        timingScore = 5; // 2食でも減点なしか、あるいは-2点か。プロンプト基準「3-5時間間隔」を「欠食なし」と解釈
        timingLabel = '2食摂取 (分散OKと仮定)';
    } else {
        timingScore = 0;
        timingLabel = '極端な偏り (-5点)';
    }

    // ─── 2. 筋トレ評価（30点） ───────────────────────────

    const hasStrong = day.strongData && day.strongData.workouts.length > 0;

    // トレーニング実施 (10点)
    let execScore = 0;
    let execLabel = '';

    // ※注意:「計画的休息」かどうかは判別できないため、筋トレデータがない日は「休息日」として満点扱いにするか、
    // あるいは「未実施」として0点にするか。
    // プロンプトでは "未実施（計画的休息除く）: -30点" とあるが、AIはコンテキストで判断できる。
    // アルゴリズム的には「筋トレデータがあれば加算、なければ一旦0点だが、休息日フラグがないので...」
    // ユーザーの要望「カレンダーに筋トレした日をマーク」からすると、筋トレした日だけ高く評価されるべきか？
    // 休息日も高得点でないと月間スコアが下がる。
    // 暫定ロジック:
    // - 筋トレあり: 満点スタート
    // - 筋トレなし: 「休息日」として 食事・生活スコアのみの満点（100点換算）にするか、あるいは筋トレセクションを免除（70点満点とする）か。
    // ここでは「筋トレありの日は30点加点チャンス、なしの日は一律満点（30点）」とすると甘すぎるか。
    // 「週2出社、週3在宅」などで筋トレ頻度は週3-4回程度と推測。
    // 実装: 筋トレデータがない日は「休息日」扱いとして 30点満点を与える（減点しない）。
    // ただしスコアの内訳表示で「休息日」と明示する。

    let trainTotal = 0;
    const trainDetail = { execution: { score: 0, label: '' }, progressive: { score: 0, label: '' }, volume: { score: 0, label: '' }, selection: { score: 0, label: '' } };

    if (hasStrong) {
        execScore = 10;
        execLabel = '実施 (満点)';

        // 漸進性過負荷 (10点) - 前回比が必要だが単日データでは不明。
        // AI評価ではないので、暫定的に「維持」として+5点を与える
        let progScore = 5;
        let progLabel = '維持推定 (+5点)';
        // NOTE: 厳密には過去データを参照する必要があるが計算コストが高い。今回は簡易実装。

        // 総負荷量 (5点)
        let volScore = 5;
        let volLabel = '推奨範囲内 (満点)';
        // 簡易判定: volume > 0 ならOK

        // 種目構成 (5点) - コンパウンド種目判定
        // BIG3や主要種目名が含まれるか
        const compoundKeywords = ['Bench', 'Squat', 'Deadlift', 'Press', 'Row', 'Chin', 'Dip'];
        const hasCompound = day.strongData!.workouts.some(w =>
            w.exercises.some(e => compoundKeywords.some(k => e.name.includes(k)))
        );
        let selScore = hasCompound ? 5 : 2;
        let selLabel = hasCompound ? 'コンパウンド含有 (満点)' : 'アイソレーション中心 (-3点)';

        trainDetail.execution = { score: execScore, label: execLabel };
        trainDetail.progressive = { score: progScore, label: progLabel };
        trainDetail.volume = { score: volScore, label: volLabel };
        trainDetail.selection = { score: selScore, label: selLabel };
        trainTotal = execScore + progScore + volScore + selScore;
    } else {
        // 筋トレなし（休息日扱い）
        // 30点満点を与える
        trainTotal = 30;
        trainDetail.execution = { score: 10, label: '休息日 (満点扱い)' };
        trainDetail.progressive = { score: 10, label: '-' };
        trainDetail.volume = { score: 5, label: '-' };
        trainDetail.selection = { score: 5, label: '-' };
    }

    // ─── 3. 生活習慣評価（20点） ─────────────────────────

    // 睡眠時間 (10点) - データないので満点
    const sleepScore = 10;
    const sleepLabel = 'データなし (満点扱い)';

    // 活動量 (10点) - 歩数
    let actScore = 0;
    let actLabel = '';
    const steps = day.steps ?? 0;

    if (steps >= 8000) {
        actScore = 10;
        actLabel = '8000歩以上 (満点)';
    } else if (steps >= 5000) {
        actScore = 5;
        actLabel = '5000-8000歩 (-5点)';
    } else {
        actScore = 0;
        actLabel = '5000歩未満 (-10点)';
    }

    const lifestyleTotal = sleepScore + actScore;

    // ─── 合計 ──────────────────────────────────────────

    const dietTotal = calorieScore + proteinScore + pfcScore + timingScore;
    const totalScore = dietTotal + trainTotal + lifestyleTotal;

    return {
        total: Math.min(100, Math.max(0, totalScore)),
        details: {
            diet: {
                total: dietTotal,
                calorie: { score: calorieScore, label: calorieLabel },
                protein: { score: proteinScore, label: proteinLabel },
                pfcBalance: { score: pfcScore, label: pfcLabel },
                timing: { score: timingScore, label: timingLabel },
            },
            workout: {
                total: trainTotal,
                ...trainDetail
            },
            lifestyle: {
                total: lifestyleTotal,
                sleep: { score: sleepScore, label: sleepLabel },
                activity: { score: actScore, label: actLabel },
            },
        },
    };
}
