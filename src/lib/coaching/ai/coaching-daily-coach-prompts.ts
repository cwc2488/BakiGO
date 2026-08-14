import type { CoachingGenerationInput, CoachingInterventionLevel, PreparedCoachingMealImage } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { coachingDaySpeechLabel, relativeCoachingDayKey } from "@/lib/coaching/coaching-time";
import {
  buildRelevantCoachActionContext,
  relevantCoachActionContextAsOfIso,
} from "@/lib/coaching/coach-actions/build-relevant-coach-action-context";

export function buildCoachingDailyCoachSystemPrompt(): string {
  return [
    "你是 Baki GO 的 AI 陪跑教練，像 LINE 上真人教練說話。",
    "語言必須使用繁體中文（台灣）：短句、自然、有溫度、直接但不責備。",
    "",
    "核心原則：",
    "- 持續 > 完美",
    "- 不責備、不羞辱、不製造罪惡感",
    "- 要求可以提高，但情緒壓力不能提高",
    "- 鼓勵的是人的努力與誠實回報，不是錯誤飲食行為",
    "- 鼓勵的是人，不是錯誤行為",
    "- 不羞辱 ≠ 所有行為都稱讚",
    "- 不要一直「非常棒」「繼續保持」；不要教科書／學術語氣",
    "",
    "權責切分（必須遵守）：",
    "- System owns：priorities / evidence / recurringIssue / improvedIssue / coachAttention / finalInterventionLevel / dailyNutritionAssessment / mealFollowUpBudget",
    "- AI owns：怎麼講、逐餐簡評、對 customer_note 的回應、在 budget 內的追問語氣",
    "- 系統決定今天要講什麼；AI 決定怎麼講。",
    "",
    "回報日期措辭（必用）：",
    "- generationInput.logDate 是這份回報的日期；可能是今天、昨天或前天（補回報）",
    "- 若 reportDayRelation = today：可用「今天」",
    "- 若 reportDayRelation = yesterday：用「昨天」或「你昨天的回報裡…」，禁止說「今天你…」指這份回報",
    "- 若 reportDayRelation = day_before_yesterday：用「前天」或「你 M/D 的回報裡…」，禁止說「今天你…」",
    "- tomorrow_focus 仍是「下一天／之後要注意的事」，不要把補登日說成「明天」的事實",
    "",
    "DecisionContext contract：",
    "- adjustment_priorities 必須完全依 decisionContext.priorities 的主題產生（最多 2 個）",
    "- 若 priorities = []：adjustment_priorities 必須是 []",
    "- tomorrow_focus 必須改寫 priority[0].tomorrowFocusSubject；不得自行換題",
    "- recurring_issue / improved_issue / coach_attention / evidence 服從 decisionContext",
    "- 逐餐 meal_feedback 可以評論三餐，但不等於 priority",
    "",
    "Goal / Outcome（必用）：",
    "- Daily Coach 不是只評論一餐，而是幫 Customer 朝 Coaching Goal 前進",
    "- 必須使用 decisionContext.goalContext 與 decisionContext.outcomeAssessment",
    "- measurementStage=baseline_only：只能用 goal + baseline 當背景；禁止說身體正在改善／惡化／卡住／沒變化",
    "- baseline_only 允許：「以你的減脂目標來看…」「等下一次回測再一起看身體變化」",
    "- baseline_only 禁止：「最近體脂下降」「體重沒變」「數據變差」「所以體脂會上升」",
    "- comparison/trend：只能使用 outcomeAssessment 已判定的結果與 evidence；禁止自行計算／發明不存在的量測變化",
    "- 當 measurementStage 為 comparison_available／trend_available，且 outcomeStatus 為 improving／mixed／flat／worsening：today_feedback 必須用自然、支持性、非醫療化人話帶出 outcomeAssessment.customerSummary（或等價 evidence），讓 Customer 感受到回測結果",
    "- improving：指出 evidence-backed 改善（例如體脂下降、肌肉大致維持／上升）；禁止說成「因為今天飲食所以體脂下降」",
    "- mixed：同時說出改善與需注意指標；體重下降但肌肉流失時，不可只看成減脂成功",
    "- flat：說明目前回測變化有限，不等于失敗、不責備、不製造焦慮",
    "- worsening：清楚說目前結果未朝目標前進，但不得羞辱或製造焦慮",
    "- not_yet_measurable：繼續禁止任何 body-change／trend wording",
    "- 結果不好可以提高要求，但不可提高羞辱、焦慮或情緒壓力",
    "- 減脂 ≠ 體重下降；肌肉流失明顯時不可稱讚單純減脂成功",
    "",
    "DailyNutritionAssessment（必用，整日減脂判斷）：",
    "- decisionContext.dailyNutritionAssessment 是系統對「整天飲食方向」的判斷，不是逐欄位摘要",
    "- daily_food_summary 必須包含：1) 整體方向 2) 最重要 pattern 3) 為什麼值得注意 4) 最少可執行 adjustment",
    "- 不要只寫「早餐 X、午餐 Y、晚餐 Z」",
    "- level = needs_adjustment / off_track 時：encouragement 與 today_feedback 不可稱讚飲食行為本身（禁止：做得很好／吃得很棒／飲食很不錯／吃得開心最重要／繼續保持這樣吃）",
    "- level = off_track 時：today_feedback / daily_food_summary 必須清楚說明「整體比較偏離目前減脂方向」，禁止弱化成「稍微調整／小調整／差不多」；要誠實、直接、不羞辱、不說失敗",
    "- off_track 合格例：「如果以減脂來看，今天整體的飲食確實比較偏離目前的方向。」",
    "- 可以鼓勵：願意回報、誠實寫下感受、有運動、有做到 plan 中真正完成的事、願意持續",
    "- 合格例：「三餐都有認真回報，這點很好。不過如果以減脂來看，今天的飲食組合確實需要調整。」",
    "- 禁止羞辱例：「你怎麼可以這樣吃」「這樣一定瘦不下來」「你今天完全失敗」",
    "- 奶昔是 observation：若 plan 本來就含奶昔，不要把喝奶昔本身講成錯誤；若有 hunger，可討論飽足感",
    "- level = on_track 且 priorities=[]：不要硬找問題；可真誠鼓勵",
    "- level = insufficient_data：不要硬猜整天飲食品質",
    "- 單餐偏離不要妖魔化；多餐累積才強調「整天累積」",
    "",
    "Meal observations（必用）：",
    "- 必須根據 decisionContext.mealObservations 寫 daily_food_summary 與 meal_feedback",
    "- mealObservations 已由先前 vision／heuristic 產生；本輪不會再附照片，禁止要求看圖或臆測未列的食物",
    "- 有炒飯就要提到炒飯；有奶昔就要提到奶昔",
    "- 不確定就說不確定；禁止把推測寫成確定事實",
    "- noOtherFoodVisible=true 只代表「照片裡目前沒看到其他食物」，絕不等於「實際沒吃其他東西」",
    "- solidFoodObserved=true 時禁止再問「有沒有搭配其他食物」",
    "- 奶昔餐禁止寫「似乎沒有搭配其他食物／沒有搭配其他食物／只有奶昔／確定只喝奶昔」",
    "- 禁止捏造 meal 事實（例如把不是奶昔的餐說成「三餐奶昔」）；所有食物陳述必須能追溯 mealObservations",
    "",
    "Meal follow-up budget（必用）：",
    "- 服從 decisionContext.mealFollowUpBudget：一個 log_date 客戶端最多 1 個 meal clarification",
    "- 若 allowCustomerMealClarification=false：所有 meal_feedback.follow_up_question 必須是 null",
    "- 若 consolidatedQuestion 有值：把它放在 follow_up_for_tomorrow（或一次整體詢問），不要早餐問一次、晚餐再問一次",
    "- 若 selectedMealSlot 有值：只在該餐放 follow_up_question，其他餐必須 null",
    "- 同類「還有沒有搭配其他東西？」禁止同一天重複",
    "- Follow-up 是工具，不是固定模板；已有足夠資訊可給安全建議時可以完全不問",
    "",
    "Sleep feedback（必用，同時評估 duration + bedtime）：",
    "- lifestyle_feedback.sleep 必須同時看 sleepDuration 與 sleepBedtime",
    "- 若時數足夠（約 7–8 小時以上）但入睡偏晚（例如 00:24）：必須寫出「睡眠時數足夠，但入睡時間偏晚」這層意思",
    "- 不可只稱讚睡飽而忽略偏晚入睡；也不可只罵晚睡而忽略時數足夠",
    "",
    "Customer Voice（必用）：",
    "- 若 decisionContext.customerVoice 非空，customer_voice_response 必須有針對性回應",
    "- hunger_reported：先接住感受；若餐食有 shake／蛋白質偏少／澱粉集中等 evidence，可用「有可能／可能跟…有關／從你今天回報看起來」解釋，禁止武斷因果與醫療診斷",
    "- 禁止忽略「還是會很餓」這類主觀感受",
    "",
    "Plan authority：",
    "- 水量／產品／睡眠目標：有 plan 就照 plan，不可自創數字",
    "- 不能自行創造固定數字或標準（例如自創每日水量 ml）",
    "- observed water 不是 target",
    "",
    "Coach Action Memory / Known Context（必用，Phase 3d）：",
    "- generationInput.recentCoachActionMemory = 近期教練處理紀錄（可能有多筆）",
    "- relevantCoachActionContext.knownContexts = 系統已選出、與當日 active issue 對得上的 Known Context（必用）",
    "- Known Context = Coach 已確認、仍 relevant 的 situational／causal 資訊；Unknown = 尚未確認、可澄清的資訊",
    "- 若 relevant knownContexts 非空：討論該 active issue 時必須自然延續這些 context（Coach output 必用；Customer output 在 note 屬 confirmed coaching context 時可自然使用）",
    "- 不得要求把全部 recent memory 都寫進文案；只延續 relevant knownContexts",
    "- 不得重新 discovery 已知 context（例如已知晚睡原因後再問「為什麼晚睡」）",
    "- 不得把 known context 擴寫成 unsupported 因果／醫療推論",
    "- 這是 context，不是 measurement／outcome／intervention authority；不得改寫 outcomeAssessment／finalInterventionLevel",
    "- 若條件仍持續或惡化：acknowledgement-aware follow-up（延續觀察／可行策略），不得假裝問題不存在",
    "- Coach Directive ≠ Coach Action",
    "",
    "禁止：",
    "- 食物警察、羞辱、單餐定罪",
    "- 自行重開 priority／intervention／dailyNutritionAssessment",
    "- 長篇營養課、calorie／macro 估算、醫療診斷",
    "- 只稱讚「有回報」卻不談吃了什麼（當有 mealObservations 時）",
    "- 「似乎沒有搭配其他食物」這類把照片缺漏寫成確定事實的句子",
    "- 對 needs_adjustment／off_track 日稱讚「飲食很好」",
    "- 忽略 relevantCoachActionContext.knownContexts 後重複相同 clarification 或只講抽象議題標籤",
    "",
    "Anti-repetition（同一筆陪跑紀錄內必須遵守）：",
    "- 不要重複同一句話",
    "- 不要用不同句子複述同一個建議",
    "- 不要在相鄰句子重講同一個觀察",
    "- 每一句都要帶來新資訊",
    "",
    "Customer today_feedback 結構（依序，不要循環複述）：",
    "- 觀察 OBSERVATION → 解讀 INTERPRETATION → 今天可做的事 TODAY'S ACTION → 下一步 NEXT FOCUS",
    "- tomorrow_focus 欄位負責「下一步」；today_feedback 不要再整段複述 tomorrow_focus",
    "",
    "Coach daily_summary 結構（依序，給教練看的操作摘要）：",
    "- 什麼變了 WHAT CHANGED → 教練該留意 WHAT COACH SHOULD NOTICE → 下次追什麼 WHAT TO FOLLOW UP",
    "- 禁止把 customer.today_feedback 原句或近義句貼進 daily_summary",
    "- Customer 要清楚、支持、可執行；Coach 要短、操作、解釋意義。同一證據、不同受眾。",
  ].join("\n");
}

export function buildCoachingDailyCoachUserPrompt(input: {
  generationInput: CoachingGenerationInput;
  finalInterventionLevel: CoachingInterventionLevel;
  preparedMealImages: PreparedCoachingMealImage[];
  decisionContext: CoachingDecisionContext;
}): string {
  const { generationInput, finalInterventionLevel, preparedMealImages, decisionContext } = input;
  const reportDayRelation = relativeCoachingDayKey(generationInput.logDate) ?? "historical";
  const reportDaySpeechLabel = coachingDaySpeechLabel(generationInput.logDate);
  const relevantCoachActionContext = buildRelevantCoachActionContext({
    memory: generationInput.recentCoachActionMemory,
    decisionContext,
    asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
  });
  // P0.2/P0.4 compact payload: decision facts only; truncate evidence/plan/sequence;
  // no raw photos, no full recentCoachActionMemory, no memoryLegend / styleExamples.
  const today = generationInput.todayContext;
  const plan = generationInput.profileMemory.planSnapshot;
  const compactPlan = {
    hydration: plan.dailyInstructions?.hydration?.slice(0, 2) ?? [],
    sleep: plan.dailyInstructions?.sleep?.slice(0, 2) ?? [],
    breakfast: plan.dailyInstructions?.breakfast?.slice(0, 2) ?? [],
    lunch: plan.dailyInstructions?.lunch?.slice(0, 2) ?? [],
    dinner: plan.dailyInstructions?.dinner?.slice(0, 2) ?? [],
    dietaryGuidelines: (plan.dietaryGuidelines ?? []).slice(0, 8),
  };
  const compactMeals = decisionContext.mealObservations.map((obs) => ({
    mealSlot: obs.mealSlot,
    observedFoods: obs.observedFoods.slice(0, 6),
    signals: obs.signals.slice(0, 6),
    evidenceText: (obs.evidenceText ?? []).slice(0, 3),
    shakeObserved: obs.shakeObserved ?? null,
    solidFoodObserved: obs.solidFoodObserved ?? null,
    noOtherFoodVisible: obs.noOtherFoodVisible ?? null,
    friedOrHighOilCookingObserved: obs.friedOrHighOilCookingObserved ?? null,
    uncertainties: (obs.uncertainties ?? []).slice(0, 3),
    followUpQuestion: obs.followUpQuestion ?? null,
  }));
  const measurements = generationInput.outcomeMemory.measurementSequence ?? [];
  const compactSequence =
    measurements.length <= 2 ? measurements : measurements.slice(Math.max(0, measurements.length - 2));

  const payload = {
    logDate: generationInput.logDate,
    reportDayRelation,
    reportDaySpeechLabel,
    finalInterventionLevel,
    decisionContext: {
      priorities: decisionContext.priorities.map((item) => ({
        rank: item.rank,
        signalKey: item.signalKey,
        reason: item.reason,
        tomorrowFocusSubject: item.tomorrowFocusSubject,
        evidence: item.evidence.slice(0, 4),
      })),
      positiveSignals: decisionContext.positiveSignals.map((item) => ({
        key: item.key,
        evidence: item.evidence.slice(0, 3),
      })),
      recurringIssue: decisionContext.recurringIssue
        ? {
            key: decisionContext.recurringIssue.key,
            label: decisionContext.recurringIssue.label,
            evidence: decisionContext.recurringIssue.evidence.slice(0, 3),
          }
        : null,
      improvedIssue: decisionContext.improvedIssue
        ? {
            key: decisionContext.improvedIssue.key,
            label: decisionContext.improvedIssue.label,
            evidence: decisionContext.improvedIssue.evidence.slice(0, 3),
          }
        : null,
      coachAttention: {
        required: decisionContext.coachAttention.required,
        reason: decisionContext.coachAttention.reason,
      },
      customerVoice: decisionContext.customerVoice.map((item) => ({
        key: item.key,
        rawExcerpt: item.rawExcerpt,
      })),
      mealObservations: compactMeals,
      photoReuse: decisionContext.photoReuse,
      pendingFollowUps: decisionContext.pendingFollowUps,
      dailyNutritionAssessment: {
        level: decisionContext.dailyNutritionAssessment.level,
        reasons: decisionContext.dailyNutritionAssessment.reasons.slice(0, 4),
        adjustmentSubjects: decisionContext.dailyNutritionAssessment.adjustmentSubjects.slice(0, 4),
        confidence: decisionContext.dailyNutritionAssessment.confidence,
      },
      mealFollowUpBudget: {
        allowCustomerMealClarification: decisionContext.mealFollowUpBudget.allowCustomerMealClarification,
        selectedMealSlot: decisionContext.mealFollowUpBudget.selectedMealSlot,
        consolidatedQuestion: decisionContext.mealFollowUpBudget.consolidatedQuestion,
      },
      goalContext: {
        goalType: decisionContext.goalContext.goalType,
        goalLabel: decisionContext.goalContext.goalLabel,
        measurementStage: decisionContext.goalContext.measurementStage,
      },
      outcomeAssessment: {
        outcomeStatus: decisionContext.outcomeAssessment.outcomeStatus,
        trendStatus: decisionContext.outcomeAssessment.trendStatus,
        customerSummary: decisionContext.outcomeAssessment.customerSummary,
        reasons: decisionContext.outcomeAssessment.reasons.slice(0, 4),
        comparison: decisionContext.outcomeAssessment.comparison
          ? {
              interpretation: decisionContext.outcomeAssessment.comparison.interpretation,
              deltas: decisionContext.outcomeAssessment.comparison.deltas,
            }
          : null,
      },
    },
    profileMemory: {
      goal: generationInput.profileMemory.goal,
      daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
      plan: compactPlan,
    },
    rollingMemory: {
      aggregates: {
        windowDays: generationInput.rollingMemory.aggregates.windowDays,
        daysSubmitted: generationInput.rollingMemory.aggregates.daysSubmitted,
        mealReportRate: generationInput.rollingMemory.aggregates.mealReportRate,
        averageWaterMl: generationInput.rollingMemory.aggregates.averageWaterMl,
        averageSleepDurationMinutes: generationInput.rollingMemory.aggregates.averageSleepDurationMinutes,
        lateSleepDays: generationInput.rollingMemory.aggregates.lateSleepDays,
        exerciseDays: generationInput.rollingMemory.aggregates.exerciseDays,
      },
      recurringPatterns: generationInput.rollingMemory.recurringPatterns.slice(0, 4),
    },
    outcomeMemory: {
      baselineMeasurement: generationInput.outcomeMemory.baselineMeasurement,
      latestMeasurement: generationInput.outcomeMemory.latestMeasurement,
      measurementSequence: compactSequence,
    },
    coachDirectives: generationInput.coachDirectives,
    knownCoachContexts: relevantCoachActionContext.knownContexts.map((item) => ({
      matchedActiveKeys: item.matchedActiveKeys,
      note: item.note,
      distinctiveFragments: item.distinctiveFragments.slice(0, 4),
    })),
    todayFacts: {
      waterMl: today.waterMl,
      sleepBedtime: today.sleepBedtime,
      sleepWakeTime: today.sleepWakeTime,
      sleepDurationMinutes: today.sleepDurationMinutes,
      exerciseNote: today.exerciseNote,
      bowelMovementCount: today.bowelMovementCount,
      customerNote: today.customerNote,
      primaryMeals: today.primaryMeals.map((meal) => ({
        mealSlot: meal.mealSlot,
        hasPhoto: Boolean(meal.storagePath),
        // textNote omitted when mealObservations exist — structured observations are authoritative.
        ...(compactMeals.length === 0 ? { textNote: meal.textNote } : {}),
      })),
      secondaryMealNotes: today.secondaryMealNotes.slice(0, 3),
    },
    priorAiContext: generationInput.priorAiContext
      ? {
          tomorrowFocus: generationInput.priorAiContext.tomorrowFocus?.value ?? null,
          recurringIssue: generationInput.priorAiContext.recurringIssue?.value ?? null,
          improvedIssue: generationInput.priorAiContext.improvedIssue?.value ?? null,
          // pendingFollowUps already in decisionContext — do not send the same list twice.
        }
      : null,
    mealImageSlotsAttached: preparedMealImages.map((image) => image.mealSlot),
  };

  const knownContextBlock =
    relevantCoachActionContext.knownContexts.length === 0
      ? [
          "Known Context：無（今日 active issue 沒有對得上的 material Coach Action）。",
          "Unknown：對 active issue 尚未確認的原因可做有限度澄清。",
        ].join("\n")
      : [
          "Known Context 見 JSON knownCoachContexts（結構化為準；禁止把同一段 note 再展開一次）。",
          "討論對應 active issue 時必須自然延續；禁止重新 discovery。",
          "Coach daily_summary 與（若對 Customer 可見的 confirmed coaching context）today_feedback／sleep feedback 必須帶入 note 的 situational meaning；不可只寫議題標籤。",
          "禁止把 Known Context 擴寫成 unsupported 因果／醫療推論。",
          "Unknown：僅限 Known Context 未涵蓋的部分才可澄清。",
        ].join("\n");

  return [
    "請依下列 JSON context 產出 daily coach structured output。",
    `系統決定的 finalInterventionLevel = ${finalInterventionLevel}`,
    `系統決定的 dailyNutritionAssessment.level = ${decisionContext.dailyNutritionAssessment.level}`,
    "必須服從 decisionContext；daily_food_summary 要做整日減脂判斷，不是逐欄位清單。",
    "adjustment_priorities 最多 2 個，只能改寫 priorities 主題；若 [] 則保持 []。",
    "mealFollowUpBudget：客戶端 meal clarification 最多 1 個；禁止同日重複「還有沒有搭配」。",
    "語氣要像台灣 LINE 真人減脂教練，不要學術報告，也不要軍事教練。",
    "鼓勵的是人，不是錯誤行為。needs_adjustment／off_track 時不可稱讚飲食行為本身。",
    "off_track：必須清楚說整體偏離減脂方向，禁止「稍微調整」這類淡化。",
    "Goal-aware：依 goalContext 說明今天行為是否朝目標前進；baseline_only 禁止評論身體變化。",
    "Outcome：只能複述 outcomeAssessment.customerSummary／evidence；comparison／trend 時 today_feedback 必須讓 Customer 感受到回測結果；禁止自行發明體重／體脂變化或因果。",
    knownContextBlock,
    "奶昔本身不是錯誤；plan-approved shake 不要挑毛病。食物事實必須 evidence-backed。",
    "飢餓感受：用「有可能／可能跟…有關」連結餐食 evidence，禁止武斷。",
    "睡眠：必須同時評估時數與入睡時間（例如 8h 足夠但 00:24 偏晚）。",
    "同一筆輸出內禁止重複句子或近義複述；Coach 摘要不要複製 Customer 文案。",
    `這份回報日期是 ${generationInput.logDate}（${reportDaySpeechLabel} / ${reportDayRelation}）。若不是今天，禁止用「今天你…」描述這份回報。`,
    "",
    JSON.stringify(payload),
  ].join("\n");
}

export function buildCoachingDailyCoachImageIntro(mealSlot: string): string {
  return `以下為 ${mealSlot} 餐照片：`;
}
