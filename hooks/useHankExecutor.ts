// ============================================================================
// HANK EXECUTOR HOOK - El cerebro que decide qué herramienta ejecutar
// ============================================================================

import { useState, useCallback } from 'react';
import {
  gymAddExercise,
  gymRemoveExercise,
  gymReplaceExercise,
  gymGetTodayRoutine,
  gymListExercises,
  gymGetExerciseDetails,
  gymUpdateSeriesDetail,
  gymCreateExerciseGroup,
  gymRemoveExerciseGroup,
  assetUpdateField,
  assetRead,
  assetGetSchema,
  assetRemoveSeries,
  assetAddSeries,
  assetReplaceSeries,
  assetSetSeries,
  dietAddCalories,
  logWorkoutSet,
  adnGetProfile,
  adnGetRecords,
  adnUpdateProfile,
  adnAddMeasurement,
  adnRemoveMeasurement,
  adnUpdateMeasurement,
  adnSetBiometrics,
  autoAdjustAll,
  // PLAN Tools
  planAddMeal,
  planRemoveMeal,
  planUpdateMealTime,
  planUpdateIngredients,
  planGetMeals,
  planGetShoppingList,
  planGetNextMeal,
  spotifyGetCurrentTrack,
  planAddSupplement,
  planRemoveSupplement,
  planUpdateSupplementTime,
  planUpdateSupplementDose,
  planUpdateSupplementName,
  planUpdateMealName,
  planGetStack,
  // Meal Options (Alternativas)
  planAddMealOption,
  planSelectMealOption,
  planRemoveMealOption,
  planGetMealOptions,
  // Training Tools
  trainingSetFrequency,
  trainingSetCurrentDay,
  // Omniscient Tools
  getFullUserContext,
  planGetMealDetails,
  // System Tools
  hankClearHistory,
  // Training Plan Tools
  trainingDesignPlan,
  trainingListTemplates,
  trainingAssignPlan,
  trainingGetCurrentPlan,
  trainingRestructure,
  trainingRenameDay,
  trainingAddDay,
  trainingRemoveDay,
  // External Training Tools (Modo personalizado para usuarios experimentados)
  trainingGetStatus,
  trainingSetExternalMode,
  trainingSetExternalSchedule,
  trainingRemoveExternalDay,
  // Sync Tools
  getFullPlanStatus,
  // Progress Photos
  progressGetPhotos,
  progressGetPhotoDetail,
  progressComparePhotos,
  // PRO Tools
  proAddExerciseNote,
  proGetExerciseNotes,
  // User Goal Tools
  setUserGoal,
  getUserGoals,
  updateGoalProgress,
  // System Tools
  hankGetCapabilities,
  TOOL_DEFINITIONS,
  // AI-POWERED INGREDIENT ANALYSIS Tools
  hankAnalyzeIngredientsAdvanced,
  hankGetSubstitutionSuggestions,
  hankCheckAllergens,
  hankOptimizeMealForMacros,
  // AI-POWERED VISUAL ANALYSIS Tools
  hankAnalyzeProgressPhoto,
  hankCompareProgressPhotos,
  hankAnalyzeFoodPhoto,
  hankGenerateProgressTimeline,
} from '../services/hank/tools';
import {
  // Inventory Tools
  inventoryAddItem,
  inventoryUpdateItem,
  inventoryRemoveItem,
  inventoryListItems,
  // Maintenance Tools
  maintenanceLog,
  maintenanceGetHistory,
  maintenanceGetAlerts,
  // Event Tools
  eventCreate,
  eventUpdate,
  eventDelete,
  eventList,
  // Surf Tools
  surfLogSession,
  surfGetSessions,
  surfFavoriteSpot,
  surfGetSpots,
  SPORT_TOOL_DEFINITIONS,
} from '../services/hank/sportTools';
import { convertGramsPortions } from '../services/hank/nutrition';
import type { HankToolCall, HankToolResult, ToolDefinition } from '../types/hank';

interface UseHankExecutorProps {
  userId: string | null;
  currentTrainingDay?: number; // Día de entrenamiento desde el contexto de pantalla
}

export const useHankExecutor = (
  { userId, currentTrainingDay = 0 }: UseHankExecutorProps = { userId: null, currentTrainingDay: 0 }
) => {
  const [isExecuting, setIsExecuting] = useState(false);

  /**
   * Ejecuta una herramienta específica
   * IMPORTANTE: currentTrainingDay del contexto sobrescribe el de Gemini para evitar errores
   */
  const executeTool = useCallback(
    async (toolCall: HankToolCall): Promise<HankToolResult> => {
      if (!userId) {
        return { success: false, message: 'Usuario no autenticado.' };
      }

      setIsExecuting(true);
      console.warn(`🤖 HANK Ejecutando: ${toolCall.tool}`, toolCall.parameters);

      let result: HankToolResult;

      try {
        const p = toolCall.parameters;

        switch (toolCall.tool) {
          case 'GYM_ADD_EXERCISE':
            result = await gymAddExercise(
              userId,
              p.exerciseName as string,
              p.trainingDay as number,
              p.customSeries as Array<{ reps: number; weight: number; type: string }> | undefined,
              undefined, // userLevel
              (p.sessionIndex as number | undefined) ?? 0 // 0=Sesión A, 1=Sesión B
            );
            break;

          case 'GYM_REMOVE_EXERCISE':
            result = await gymRemoveExercise(
              userId,
              p.exerciseName as string,
              p.trainingDay as number | undefined,
              p.deleteCompletely as boolean | undefined,
              p.sessionIndex as number | undefined // filtrar por sesión si se especifica
            );
            break;

          case 'GYM_REPLACE_EXERCISE':
            result = await gymReplaceExercise(
              userId,
              p.oldExerciseName as string,
              p.newExerciseName as string,
              p.trainingDay as number | undefined
            );
            break;

          case 'GYM_GET_TODAY_ROUTINE':
            result = await gymGetTodayRoutine(
              userId,
              (p.trainingDay as number) ?? currentTrainingDay
            );
            break;

          case 'GYM_LIST_EXERCISES':
            result = await gymListExercises(userId, p.trainingDay as number | undefined);
            break;

          case 'GYM_GET_EXERCISE_DETAILS':
            result = await gymGetExerciseDetails(
              userId,
              p.exerciseName as string,
              p.trainingDay as number | undefined
            );
            break;

          case 'GYM_UPDATE_SERIES_DETAIL': {
            const seriesIdx = p.seriesIndex as string;
            const resolvedIdx =
              seriesIdx === 'first' ? 'first' : seriesIdx === 'last' ? 'last' : parseInt(seriesIdx);
            result = await gymUpdateSeriesDetail(
              userId,
              p.exerciseName as string,
              resolvedIdx,
              (p.trainingDay as number) ?? currentTrainingDay,
              {
                reps: p.reps as number | undefined,
                weight: p.weight as number | undefined,
                type: p.type as
                  | 'WARMUP'
                  | 'APPROACH'
                  | 'EFFECTIVE'
                  | 'FAILURE'
                  | 'CALENTAMIENTO'
                  | 'APROXIMACION'
                  | 'EFECTIVA'
                  | 'FALLO'
                  | undefined,
                rir: p.rir as number | undefined,
                tempo: p.tempo as string | undefined,
                restSeconds: p.restSeconds as number | undefined,
                note: p.note as string | undefined,
              }
            );
            break;
          }

          case 'GYM_CREATE_EXERCISE_GROUP':
            result = await gymCreateExerciseGroup(
              userId,
              p.exerciseNames as string[],
              p.groupType as 'SUPERSET' | 'TRISET' | 'CIRCUIT' | 'GIANT_SET',
              (p.trainingDay as number) ?? currentTrainingDay,
              p.restBetween as number | undefined,
              p.restAfter as number | undefined
            );
            break;

          case 'GYM_REMOVE_EXERCISE_GROUP':
            result = await gymRemoveExerciseGroup(
              userId,
              p.exerciseNames as string[],
              (p.trainingDay as number) ?? currentTrainingDay
            );
            break;

          case 'ASSET_UPDATE_FIELD':
            result = await assetUpdateField(
              userId,
              p.assetId as string | undefined,
              p.assetName as string | undefined,
              p.fieldPath as string,
              p.newValue,
              (p.operation as 'set' | 'increment' | 'decrement') || 'set'
            );
            break;

          case 'ASSET_READ':
            result = await assetRead(
              userId,
              p.assetId as string | undefined,
              p.assetName as string | undefined,
              p.assetType as string | undefined
            );
            break;

          case 'ASSET_GET_SCHEMA':
            result = await assetGetSchema(p.assetType as string);
            break;

          case 'DIET_ADD_CALORIES':
            result = await dietAddCalories(
              userId,
              p.mealName as string,
              p.caloriesChange as number
            );
            break;

          case 'LOG_WORKOUT_SET':
            result = await logWorkoutSet(
              p.sessionId as string,
              p.assetId as string,
              p.setDetails as { weight: number; reps: number; rir?: number }
            );
            break;

          case 'ASSET_REMOVE_SERIES':
            console.warn(
              '🎯 HANK ASSET_REMOVE_SERIES: configId=',
              p.configId,
              'assetName=',
              p.assetName,
              'seriesIndex=',
              p.seriesIndex,
              'trainingDay=',
              currentTrainingDay
            );
            result = await assetRemoveSeries(
              userId,
              p.assetName as string | undefined,
              p.seriesIndex === 'last' || p.seriesIndex === 'first'
                ? p.seriesIndex
                : parseInt(String(p.seriesIndex), 10),
              currentTrainingDay, // Usar día del contexto de pantalla
              p.configId as string | undefined
            );
            break;

          case 'ASSET_ADD_SERIES':
            // position puede ser number, 'end', 'start', o undefined
            let addPosition: 'end' | 'start' | number = 'end';
            if (typeof p.position === 'number') {
              addPosition = p.position;
            } else if (p.position === 'start') {
              addPosition = 'start';
            }
            console.warn(
              '🎯 HANK ASSET_ADD_SERIES: configId=',
              p.configId,
              'assetName=',
              p.assetName,
              'trainingDay=',
              currentTrainingDay
            );
            result = await assetAddSeries(
              userId,
              p.assetName as string | undefined,
              (p.reps as number) || 10,
              (p.weight as number) || 0,
              (p.seriesType as 'WARMUP' | 'APPROACH' | 'EFFECTIVE' | 'FAILURE') || 'EFFECTIVE',
              addPosition,
              currentTrainingDay, // Usar día del contexto de pantalla
              p.configId as string | undefined
            );
            break;

          case 'ASSET_REPLACE_SERIES':
            // seriesIndex puede ser 'last', 'first', o un número
            let replaceIdx: 'last' | 'first' | number = 'last';
            if (p.seriesIndex === 'first') {
              replaceIdx = 'first';
            } else if (p.seriesIndex === 'last') {
              replaceIdx = 'last';
            } else if (typeof p.seriesIndex === 'number') {
              replaceIdx = p.seriesIndex;
            } else if (typeof p.seriesIndex === 'string' && !isNaN(parseInt(p.seriesIndex))) {
              replaceIdx = parseInt(p.seriesIndex);
            }
            result = await assetReplaceSeries(
              userId,
              p.assetName as string | undefined,
              replaceIdx,
              (p.reps as number) || 10,
              (p.weight as number) || 0,
              (p.seriesType as 'WARMUP' | 'APPROACH' | 'EFFECTIVE' | 'FAILURE') || 'EFFECTIVE',
              currentTrainingDay, // Usar día del contexto de pantalla
              p.configId as string | undefined
            );
            break;

          case 'ASSET_SET_SERIES':
            // Recibe un array de series (puede venir como string JSON o como array)
            let seriesArray = p.series;
            if (typeof seriesArray === 'string') {
              try {
                seriesArray = JSON.parse(seriesArray);
              } catch {
                result = { success: false, message: 'Error parseando series JSON' };
                break;
              }
            }
            // Convertir al formato esperado, agregando id si no existe
            const formattedSeries = (
              seriesArray as Array<{
                id?: string;
                reps: number;
                weight: number;
                type: 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';
                note?: string;
              }>
            ).map((s, i) => ({
              id: s.id || String(Date.now() + i),
              reps: s.reps,
              weight: s.weight,
              type: s.type,
              note: s.note,
            }));
            result = await assetSetSeries(
              userId,
              p.assetName as string | undefined,
              formattedSeries,
              currentTrainingDay, // Usar día del contexto de pantalla
              p.configId as string | undefined
            );
            break;

          case 'GET_USER_CONTEXT':
            // Este se maneja desde el contexto, no aquí
            result = { success: true, message: 'Contexto obtenido desde HankContext.' };
            break;

          // ADN TOOLS
          case 'ADN_GET_PROFILE':
            result = await adnGetProfile(userId);
            break;

          case 'ADN_GET_RECORDS':
            result = await adnGetRecords(userId);
            break;

          case 'ADN_UPDATE_PROFILE':
            result = await adnUpdateProfile(
              userId,
              p.field as 'goal' | 'weight' | 'height' | 'injuries' | 'allergies' | 'display_name',
              p.value as string
            );
            break;

          case 'ADN_ADD_MEASUREMENT':
            result = await adnAddMeasurement(
              userId,
              p.name as string,
              p.value as string,
              (p.isDominant as boolean) || false
            );
            break;

          case 'ADN_REMOVE_MEASUREMENT':
            result = await adnRemoveMeasurement(userId, p.measurementName as string);
            break;

          case 'ADN_UPDATE_MEASUREMENT':
            result = await adnUpdateMeasurement(
              userId,
              p.measurementName as string,
              p.newValue as string,
              (p.isDominant as boolean) || undefined
            );
            break;

          case 'ADN_SET_BIOMETRICS':
            result = await adnSetBiometrics(userId, JSON.parse(p.updates as string));
            break;

          case 'AUTO_ADJUST_ALL':
            result = await autoAdjustAll(userId);
            break;

          // PROGRESS PHOTOS
          case 'PROGRESS_GET_PHOTOS':
            result = await progressGetPhotos(userId);
            break;

          case 'PROGRESS_GET_PHOTO_DETAIL':
            result = await progressGetPhotoDetail(userId, p.photoId as string);
            break;

          case 'PROGRESS_COMPARE_PHOTOS':
            result = await progressComparePhotos(userId, {
              firstPhotoId: p.firstPhotoId as string | undefined,
              lastPhotoId: p.lastPhotoId as string | undefined,
            });
            break;

          // PLAN TOOLS
          case 'PLAN_ADD_MEAL': {
            let ingredients = JSON.parse(p.ingredients as string);
            // Convertir gramos ↔ porciones si falta alguno
            const needsConversion = ingredients.some(
              (ing: any) => (ing.quantity && !ing.portion) || (!ing.quantity && ing.portion)
            );
            if (needsConversion) {
              try {
                ingredients = await convertGramsPortions(ingredients);
              } catch (e) {
                console.warn('Error conversión gramos/porciones:', e);
              }
            }
            result = await planAddMeal(userId, p.time as string, ingredients);
            break;
          }

          case 'PLAN_REMOVE_MEAL':
            result = await planRemoveMeal(userId, {
              mealId: p.mealId as string | undefined,
              time: p.time as string | undefined,
              position: p.position as string | undefined,
            });
            break;

          case 'PLAN_UPDATE_MEAL_TIME':
            result = await planUpdateMealTime(userId, p.newTime as string, {
              mealId: p.mealId as string | undefined,
              position: p.position as string | undefined,
              currentTime: p.currentTime as string | undefined,
            });
            break;

          case 'PLAN_UPDATE_INGREDIENTS': {
            let updateIngredients = JSON.parse(p.ingredients as string);
            // Convertir gramos ↔ porciones si falta alguno
            const needsIngConversion = updateIngredients.some(
              (ing: any) => (ing.quantity && !ing.portion) || (!ing.quantity && ing.portion)
            );
            if (needsIngConversion) {
              try {
                updateIngredients = await convertGramsPortions(updateIngredients);
              } catch (e) {
                console.warn('Error conversión gramos/porciones:', e);
              }
            }
            result = await planUpdateIngredients(
              userId,
              (p.mealIdentifier || p.mealId) as string,
              updateIngredients
            );
            break;
          }

          // ============================================================================
          // OMNISCIENT TOOLS - HANK es Dios en TRENS
          // ============================================================================
          case 'GET_FULL_USER_CONTEXT':
            result = await getFullUserContext(userId);
            break;

          case 'PLAN_GET_MEAL_DETAILS':
            result = await planGetMealDetails(userId, p.mealIdentifier as string);
            break;

          case 'PLAN_GET_MEALS':
            result = await planGetMeals(userId);
            break;

          case 'PLAN_GET_SHOPPING_LIST':
            result = await planGetShoppingList(
              userId,
              (p.period as 'today' | '3days' | 'week') || 'today'
            );
            break;

          case 'PLAN_GET_NEXT_MEAL':
            result = await planGetNextMeal(userId);
            break;

          case 'SPOTIFY_GET_CURRENT_TRACK':
            result = await spotifyGetCurrentTrack();
            break;

          case 'PLAN_ADD_SUPPLEMENT':
            result = await planAddSupplement(userId, p.name as string, p.dose as string, {
              type: p.type as 'pill' | 'powder' | 'liquid' | 'syringe' | undefined,
              time: p.time as string | undefined,
              isPreWorkout: p.isPreWorkout as boolean | undefined,
              isPostWorkout: p.isPostWorkout as boolean | undefined,
            });
            break;

          case 'PLAN_REMOVE_SUPPLEMENT':
            result = await planRemoveSupplement(userId, p.name as string);
            break;

          case 'PLAN_UPDATE_SUPPLEMENT_TIME':
            result = await planUpdateSupplementTime(
              userId,
              p.name as string,
              p.newTime as string | undefined,
              p.newTimes as string[] | undefined
            );
            break;

          case 'PLAN_UPDATE_SUPPLEMENT_DOSE':
            result = await planUpdateSupplementDose(userId, p.name as string, p.newDose as string);
            break;

          case 'PLAN_UPDATE_SUPPLEMENT_NAME':
            result = await planUpdateSupplementName(
              userId,
              p.oldName as string,
              p.newName as string
            );
            break;

          case 'PLAN_UPDATE_MEAL_NAME':
            result = await planUpdateMealName(
              userId,
              p.newName as string,
              p.mealId as string | undefined,
              p.position as string | undefined
            );
            break;

          case 'TRAINING_SET_FREQUENCY':
            result = await trainingSetFrequency(userId, p.frequency as number);
            break;

          case 'TRAINING_SET_CURRENT_DAY':
            result = await trainingSetCurrentDay(userId, p.dayNumber as number);
            break;

          // MEAL OPTIONS (ALTERNATIVAS)
          case 'PLAN_ADD_MEAL_OPTION': {
            let optionIngredients =
              typeof p.ingredients === 'string' ? JSON.parse(p.ingredients) : p.ingredients;
            // Convertir gramos ↔ porciones si falta alguno
            const needsOptConversion = optionIngredients.some(
              (ing: any) => (ing.quantity && !ing.portion) || (!ing.quantity && ing.portion)
            );
            if (needsOptConversion) {
              try {
                optionIngredients = await convertGramsPortions(optionIngredients);
              } catch (e) {
                console.warn('Error conversión gramos/porciones:', e);
              }
            }
            result = await planAddMealOption(
              userId,
              p.mealId as string,
              p.optionName as string,
              optionIngredients
            );
            break;
          }

          case 'PLAN_SELECT_MEAL_OPTION':
            result = await planSelectMealOption(
              userId,
              p.mealId as string,
              p.optionPosition as number
            );
            break;

          case 'PLAN_REMOVE_MEAL_OPTION':
            result = await planRemoveMealOption(
              userId,
              p.mealId as string,
              p.optionPosition as number
            );
            break;

          case 'PLAN_GET_MEAL_OPTIONS':
            result = await planGetMealOptions(userId, p.mealId as string);
            break;

          case 'PLAN_GET_STACK':
            result = await planGetStack(userId);
            break;

          // SYSTEM TOOLS
          case 'HANK_CLEAR_HISTORY':
            result = await hankClearHistory(userId);
            break;

          // =========================================================================
          // PLAN BUILDER TOOLS
          // Nota: Estas herramientas devuelven instrucciones para que el contexto
          // maneje el estado. El ejecutor solo valida y devuelve el mensaje apropiado.
          // =========================================================================
          case 'PLAN_BUILDER_START':
            // El estado real se maneja en HankContext
            result = {
              success: true,
              message: `🚀 ¡MODO PLAN BUILDER ACTIVADO!

Ahora puedes construir tu plan completo conversacionalmente. Dime:
• 📍 Las comidas que quieres (ej: "desayuno a las 7 con huevos y avena")
• 💊 Los suplementos (ej: "creatina 5g en la mañana")

Cuando termines, di **"ejecuta el plan"** y lo guardaré todo.`,
              data: {
                action: 'PLAN_BUILDER_START',
                clearExisting: (p.clearExisting as boolean) || false,
              },
            };
            break;

          case 'PLAN_BUILDER_ADD_MEAL': {
            // Convertir gramos ↔ porciones para ingredientes del plan builder
            let builderIngredients = p.ingredients;
            if (typeof builderIngredients === 'string') {
              try {
                const parsed = JSON.parse(builderIngredients);
                const needsBuilderConversion = parsed.some(
                  (ing: any) => (ing.quantity && !ing.portion) || (!ing.quantity && ing.portion)
                );
                if (needsBuilderConversion) {
                  const converted = await convertGramsPortions(parsed);
                  builderIngredients = JSON.stringify(converted);
                }
              } catch (e) {
                console.warn('Error conversión plan builder:', e);
              }
            }
            result = {
              success: true,
              message: `✅ Comida agregada al plan.`,
              data: {
                action: 'PLAN_BUILDER_ADD_MEAL',
                time: p.time as string,
                ingredients: builderIngredients,
                name: p.name as string | undefined,
              },
            };
            break;
          }

          case 'PLAN_BUILDER_EDIT_MEAL': {
            // Convertir gramos ↔ porciones para ingredientes editados
            let editIngredients = p.ingredients;
            if (typeof editIngredients === 'string') {
              try {
                const parsed = JSON.parse(editIngredients);
                const needsEditConversion = parsed.some(
                  (ing: any) => (ing.quantity && !ing.portion) || (!ing.quantity && ing.portion)
                );
                if (needsEditConversion) {
                  const converted = await convertGramsPortions(parsed);
                  editIngredients = JSON.stringify(converted);
                }
              } catch (e) {
                console.warn('Error conversión plan builder edit:', e);
              }
            }
            result = {
              success: true,
              message: `✅ Comida editada en el plan.`,
              data: {
                action: 'PLAN_BUILDER_EDIT_MEAL',
                mealIdentifier: p.mealIdentifier,
                updates: {
                  time: p.time as string | undefined,
                  ingredients: editIngredients,
                  name: p.name as string | undefined,
                },
              },
            };
            break;
          }

          case 'PLAN_BUILDER_REMOVE_MEAL':
            result = {
              success: true,
              message: `🗑️ Comida eliminada del plan.`,
              data: {
                action: 'PLAN_BUILDER_REMOVE_MEAL',
                mealIdentifier: p.mealIdentifier,
              },
            };
            break;

          case 'PLAN_BUILDER_ADD_SUPPLEMENT':
            result = {
              success: true,
              message: `✅ Suplemento agregado al plan.`,
              data: {
                action: 'PLAN_BUILDER_ADD_SUPPLEMENT',
                name: p.name as string,
                dose: p.dose as string,
                type: p.type as string | undefined,
                time: p.time as string | undefined,
                isPreWorkout: p.isPreWorkout as boolean | undefined,
                isPostWorkout: p.isPostWorkout as boolean | undefined,
              },
            };
            break;

          case 'PLAN_BUILDER_REMOVE_SUPPLEMENT':
            result = {
              success: true,
              message: `🗑️ Suplemento eliminado del plan.`,
              data: {
                action: 'PLAN_BUILDER_REMOVE_SUPPLEMENT',
                nameOrIndex: p.nameOrIndex,
              },
            };
            break;

          case 'PLAN_BUILDER_SHOW':
            result = {
              success: true,
              message: `📋 Mostrando el plan en construcción...`,
              data: {
                action: 'PLAN_BUILDER_SHOW',
              },
            };
            break;

          case 'PLAN_BUILDER_CLEAR':
            result = {
              success: true,
              message: `🧹 Plan Builder limpiado. Se descartaron los cambios.`,
              data: {
                action: 'PLAN_BUILDER_CLEAR',
              },
            };
            break;

          case 'PLAN_BUILDER_EXECUTE':
            result = {
              success: true,
              message: `🏃 Ejecutando el plan...`,
              data: {
                action: 'PLAN_BUILDER_EXECUTE',
              },
            };
            break;

          // =========================================================================
          // TRAINING PLAN TOOLS
          // =========================================================================
          case 'TRAINING_DESIGN_PLAN':
            result = await trainingDesignPlan(userId, {
              goal: p.goal as string,
              level: p.level as string,
              frequency: p.frequency as number,
            });
            break;

          case 'TRAINING_LIST_TEMPLATES':
            result = await trainingListTemplates({
              level: p.level as string | undefined,
              goal: p.goal as string | undefined,
              frequency: p.frequency as number | undefined,
            });
            break;

          case 'TRAINING_ASSIGN_PLAN':
            result = await trainingAssignPlan(userId, p.planId as string);
            break;

          case 'TRAINING_GET_CURRENT_PLAN':
            result = await trainingGetCurrentPlan(userId);
            break;

          case 'TRAINING_RESTRUCTURE':
            result = await trainingRestructure(userId, JSON.parse(p.newDays as string));
            break;

          case 'TRAINING_RENAME_DAY':
            result = await trainingRenameDay(userId, p.dayIndex as number, p.newName as string);
            break;

          case 'TRAINING_ADD_DAY':
            result = await trainingAddDay(userId, p.dayName as string);
            break;

          case 'TRAINING_REMOVE_DAY':
            result = await trainingRemoveDay(userId, p.dayIndex as number);
            break;

          // =========================================================================
          // EXTERNAL TRAINING TOOLS (Usuarios que no usan módulo GYM)
          // =========================================================================
          case 'TRAINING_GET_STATUS':
            result = await trainingGetStatus(userId);
            break;

          case 'TRAINING_SET_EXTERNAL_MODE':
            result = await trainingSetExternalMode(userId, {
              enabled: p.enabled as boolean,
              frequency: p.frequency as number | undefined,
            });
            break;

          case 'TRAINING_SET_EXTERNAL_SCHEDULE': {
            // Parsear scheduleJson (string JSON) a objeto
            let schedule: Record<string, string>;
            if (typeof p.scheduleJson === 'string') {
              try {
                schedule = JSON.parse(p.scheduleJson);
              } catch (e) {
                console.warn('⚠️ Error parseando scheduleJson:', e);
                result = {
                  success: false,
                  message: '❌ Error: El formato del horario no es válido.',
                };
                break;
              }
            } else if (typeof p.schedule === 'object' && p.schedule) {
              // Fallback: soporte para el formato antiguo (objeto directo)
              schedule = p.schedule as Record<string, string>;
            } else {
              result = {
                success: false,
                message: '❌ Error: No se proporcionó un horario válido.',
              };
              break;
            }
            result = await trainingSetExternalSchedule(userId, schedule);
            break;
          }

          case 'TRAINING_REMOVE_EXTERNAL_DAY':
            result = await trainingRemoveExternalDay(userId, p.dayName as string);
            break;

          // =========================================================================
          // SYNC TOOLS
          // =========================================================================
          case 'GET_FULL_PLAN_STATUS':
            result = await getFullPlanStatus(userId);
            break;

          // =========================================================================
          // INVENTORY TOOLS (MOTO/AUTO/SURF)
          // =========================================================================
          case 'INVENTORY_ADD_ITEM':
            result = await inventoryAddItem(
              userId,
              p.sportCode as string,
              p.category as string,
              p.name as string,
              p.metadata as Record<string, unknown> | undefined
            );
            break;

          case 'INVENTORY_UPDATE_ITEM':
            result = await inventoryUpdateItem(
              userId,
              p.itemId as string,
              p.updates as Record<string, unknown>
            );
            break;

          case 'INVENTORY_REMOVE_ITEM':
            result = await inventoryRemoveItem(userId, p.itemId as string);
            break;

          case 'INVENTORY_LIST_ITEMS':
            result = await inventoryListItems(
              userId,
              p.sportCode as string | undefined,
              p.category as string | undefined
            );
            break;

          // =========================================================================
          // MAINTENANCE TOOLS (MOTO/AUTO)
          // =========================================================================
          case 'MAINTENANCE_LOG':
            result = await maintenanceLog(
              userId,
              p.itemId as string,
              p.maintenanceType as string,
              p.description as string | undefined,
              p.cost as number | undefined,
              p.mileageKm as number | undefined,
              p.nextDueDate as string | undefined,
              p.nextDueMileage as number | undefined
            );
            break;

          case 'MAINTENANCE_GET_HISTORY':
            result = await maintenanceGetHistory(userId, p.itemId as string | undefined);
            break;

          case 'MAINTENANCE_GET_ALERTS':
            result = await maintenanceGetAlerts(userId);
            break;

          // =========================================================================
          // EVENT TOOLS (MOTO/AUTO)
          // =========================================================================
          case 'EVENT_CREATE':
            result = await eventCreate(
              userId,
              p.sportCode as string,
              p.name as string,
              p.eventType as string,
              p.eventDate as string,
              p.location as string | undefined,
              p.notes as string | undefined
            );
            break;

          case 'EVENT_UPDATE':
            result = await eventUpdate(
              userId,
              p.eventId as string,
              p.updates as Record<string, unknown>
            );
            break;

          case 'EVENT_DELETE':
            result = await eventDelete(userId, p.eventId as string);
            break;

          case 'EVENT_LIST':
            result = await eventList(
              userId,
              p.sportCode as string | undefined,
              p.upcoming as boolean | undefined
            );
            break;

          // =========================================================================
          // SURF SESSION TOOLS
          // =========================================================================
          case 'SURF_LOG_SESSION':
            result = await surfLogSession(
              userId,
              p.spotName as string,
              p.waveSizeFt as number | undefined,
              p.wavePeriodS as number | undefined,
              p.windDirection as string | undefined,
              p.windSpeedKts as number | undefined,
              p.tide as 'HIGH' | 'MID' | 'LOW' | undefined,
              p.waterTempC as number | undefined,
              p.durationMin as number | undefined,
              p.sessionRating as number | undefined,
              p.notes as string | undefined,
              p.boardId as string | undefined
            );
            break;

          case 'SURF_GET_SESSIONS':
            result = await surfGetSessions(
              userId,
              p.spotName as string | undefined,
              p.limit as number | undefined
            );
            break;

          case 'SURF_FAVORITE_SPOT':
            result = await surfFavoriteSpot(
              userId,
              p.spotName as string,
              p.latitude as number | undefined,
              p.longitude as number | undefined
            );
            break;

          case 'SURF_GET_SPOTS':
            result = await surfGetSpots(userId);
            break;

          // =========================================================================
          // PRO TOOLS (Notas de ejercicio)
          // =========================================================================
          case 'PRO_ADD_EXERCISE_NOTE':
            result = await proAddExerciseNote(userId, p.exerciseName as string, p.note as string, {
              weightKg: p.weightKg as number | undefined,
              reps: p.reps as number | undefined,
              tags: p.tags as string[] | undefined,
            });
            break;

          case 'PRO_GET_EXERCISE_NOTES':
            result = await proGetExerciseNotes(
              userId,
              p.exerciseName as string,
              p.limit as number | undefined
            );
            break;

          // =========================================================================
          // USER GOAL TOOLS (Metas con fechas)
          // =========================================================================
          case 'SET_USER_GOAL':
            result = await setUserGoal(
              userId,
              p.goalType as 'weight' | 'body_fat' | 'muscle_mass' | 'strength' | 'custom',
              p.targetValue as string,
              p.targetDate as string,
              {
                description: p.description as string | undefined,
                exerciseName: p.exerciseName as string | undefined,
                startValue: p.startValue as string | undefined,
              }
            );
            break;

          case 'GET_USER_GOALS':
            result = await getUserGoals(userId);
            break;

          case 'UPDATE_GOAL_PROGRESS':
            result = await updateGoalProgress(
              userId,
              p.goalId as string,
              p.newValue as string,
              p.status as 'active' | 'completed' | 'abandoned' | undefined
            );
            break;

          // =========================================================================
          // HANK SYSTEM TOOLS
          // =========================================================================
          case 'HANK_GET_CAPABILITIES':
            result = await hankGetCapabilities();
            break;

          // =========================================================================
          // AI-POWERED INGREDIENT ANALYSIS TOOLS
          // =========================================================================
          case 'ANALYZE_INGREDIENTS_AI':
            result = await hankAnalyzeIngredientsAdvanced(userId, {
              ingredients: p.ingredients as string,
              userContext: p.userContext as string | undefined,
              includeQuality: p.includeQuality as boolean | undefined,
              includeAllergens: p.includeAllergens as boolean | undefined,
              includeSuggestions: p.includeSuggestions as boolean | undefined,
            });
            break;

          case 'GET_SUBSTITUTION_SUGGESTIONS':
            result = await hankGetSubstitutionSuggestions(userId, {
              ingredients: p.ingredients as string,
              goal: p.goal as string,
            });
            break;

          case 'CHECK_ALLERGENS':
            result = await hankCheckAllergens(userId, {
              ingredients: p.ingredients as string,
              userAllergens: p.userAllergens as string | undefined,
            });
            break;

          case 'OPTIMIZE_MEAL_MACROS':
            result = await hankOptimizeMealForMacros(userId, {
              mealDescription: p.mealDescription as string,
              targetCalories: p.targetCalories as number | undefined,
              targetProtein: p.targetProtein as number | undefined,
              targetCarbs: p.targetCarbs as number | undefined,
              targetFat: p.targetFat as number | undefined,
              constraints: p.constraints as string | undefined,
            });
            break;

          // =========================================================================
          // AI-POWERED VISUAL ANALYSIS TOOLS
          // =========================================================================
          case 'ANALYZE_PROGRESS_PHOTO':
            result = await hankAnalyzeProgressPhoto(userId, {
              photoUrl: p.photoUrl as string | undefined,
              photoId: p.photoId as string | undefined,
            });
            break;

          case 'COMPARE_PROGRESS_PHOTOS':
            result = await hankCompareProgressPhotos(userId, {
              beforePhotoUrl: p.beforePhotoUrl as string | undefined,
              afterPhotoUrl: p.afterPhotoUrl as string | undefined,
              beforePhotoId: p.beforePhotoId as string | undefined,
              afterPhotoId: p.afterPhotoId as string | undefined,
            });
            break;

          case 'ANALYZE_FOOD_PHOTO':
            result = await hankAnalyzeFoodPhoto(userId, {
              photoUrl: p.photoUrl as string,
            });
            break;

          case 'GENERATE_PROGRESS_TIMELINE':
            result = await hankGenerateProgressTimeline(userId, {
              limit: p.limit as number | undefined,
            });
            break;

          default:
            console.warn(`Herramienta no implementada: ${toolCall.tool}`);
            result = { success: false, message: `Herramienta "${toolCall.tool}" no reconocida.` };
        }
      } catch (e) {
        console.error('Error crítico en Hank Executor:', e);
        result = { success: false, message: 'Error interno de ejecución.' };
      } finally {
        setIsExecuting(false);
      }

      console.warn(`🤖 HANK Resultado:`, result);
      return result;
    },
    [userId, currentTrainingDay] // Agregar currentTrainingDay a las dependencias
  );

  /**
   * Ejecuta múltiples herramientas en secuencia
   */
  const executeToolChain = useCallback(
    async (toolCalls: HankToolCall[]): Promise<HankToolResult[]> => {
      const results: HankToolResult[] = [];

      for (const call of toolCalls) {
        const result = await executeTool(call);
        results.push(result);

        // Si una falla, detener la cadena
        if (!result.success) {
          console.warn('🤖 HANK: Cadena detenida por error en:', call.tool);
          break;
        }
      }

      return results;
    },
    [executeTool]
  );

  /**
   * Obtiene las definiciones de herramientas para el LLM
   * Incluye herramientas base + herramientas de deporte
   */
  const getToolDefinitions = useCallback((): ToolDefinition[] => {
    return [...TOOL_DEFINITIONS, ...SPORT_TOOL_DEFINITIONS];
  }, []);

  return {
    executeTool,
    executeToolChain,
    getToolDefinitions,
    isExecuting,
  };
};
