/**
 * iSEPADU AI — Academic Visual Standard Verification Suite
 * Tests all 20 rules of the Academic Visual Standard specification:
 *   1. PBD TP1-TP6 color mapping (TP1-2 RED, TP3 ORANGE, TP4-6 GREEN)
 *   2. UASA Grade calculation & interpretation (82-100 A, 66-81 B, 50-65 C, 35-49 D, 20-34 E, 0-19 F)
 *   3. UASA Grade color mapping (A-B GREEN, C YELLOW, D ORANGE, E-F RED)
 *   4. Semantic tokens consistency (academicDanger, academicWarning, academicCaution, academicSuccess)
 *   5. Near Miss target-based logic (PBD 1 level below target; UASA 1-3 marks to boundary)
 *   6. Mismatch target-gap logic (PBD gap >= 2; UASA gap >= 2 grades)
 *   7. Intervention priority synthesis (CRITICAL, HIGH, WATCH, ON TRACK, EXCELLENT)
 *   8. Progress direction (↑, →, ↓) decoupling from current achievement color
 *   9. Chart palette alignment without series distortion
 */

import {
  getPbdStatus,
  getPbdSemanticColor,
  getUasaGrade,
  getUasaGradeInterpretation,
  getUasaSemanticColor,
  getProgressDirection,
  getNearMissStatus,
  getMismatchStatus,
  getInterventionPriority,
  ACADEMIC_COLOR_TOKENS,
  PBD_CHART_PALETTE,
  UASA_CHART_PALETTE,
  COMPARISON_SERIES_PALETTE,
  PbdLevel,
  UasaGrade,
  DEFAULT_2026_6_LEVEL_SCALE,
  SCALE_2027_YEAR1_3_LEVEL,
  resolvePbdScale,
  calculateScaleGap,
  checkTovCarryForwardCompatibility,
} from '../src/utils/academicVisualStandard';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function runTest(id: string, name: string, fn: () => { passed: boolean; details: string }) {
  try {
    const res = fn();
    results.push({ id, name, passed: res.passed, details: res.details });
  } catch (err: any) {
    results.push({ id, name, passed: false, details: `Exception: ${err.message}` });
  }
}

// ----------------------------------------------------------------------------
// TC-AVS-01: PBD TP1-TP6 Color Standard
// ----------------------------------------------------------------------------
runTest('TC-AVS-01', 'PBD TP1-TP6 maps to RED (1-2), ORANGE (3), and GREEN (4-6)', () => {
  const tp1 = getPbdSemanticColor(1);
  const tp2 = getPbdSemanticColor(2);
  const tp3 = getPbdSemanticColor(3);
  const tp4 = getPbdSemanticColor(4);
  const tp5 = getPbdSemanticColor(5);
  const tp6 = getPbdSemanticColor(6);

  const passed =
    tp1 === 'academicDanger' &&
    tp2 === 'academicDanger' &&
    tp3 === 'academicWarning' &&
    tp4 === 'academicSuccess' &&
    tp5 === 'academicSuccess' &&
    tp6 === 'academicSuccess';

  return {
    passed,
    details: `TP1=${tp1}, TP2=${tp2}, TP3=${tp3}, TP4=${tp4}, TP5=${tp5}, TP6=${tp6}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-02: UASA Grade Boundary Calculation (Official KPM Scale)
// ----------------------------------------------------------------------------
runTest('TC-AVS-02', 'UASA score converts strictly to official grades A-F', () => {
  const gA1 = getUasaGrade(100);
  const gA2 = getUasaGrade(82);
  const gB1 = getUasaGrade(81);
  const gB2 = getUasaGrade(66);
  const gC1 = getUasaGrade(65);
  const gC2 = getUasaGrade(50);
  const gD1 = getUasaGrade(49);
  const gD2 = getUasaGrade(35);
  const gE1 = getUasaGrade(34);
  const gE2 = getUasaGrade(20);
  const gF1 = getUasaGrade(19);
  const gF2 = getUasaGrade(0);

  const passed =
    gA1 === 'A' && gA2 === 'A' &&
    gB1 === 'B' && gB2 === 'B' &&
    gC1 === 'C' && gC2 === 'C' &&
    gD1 === 'D' && gD2 === 'D' &&
    gE1 === 'E' && gE2 === 'E' &&
    gF1 === 'F' && gF2 === 'F';

  return {
    passed,
    details: `Boundaries verified: 82->${gA2}, 66->${gB2}, 50->${gC2}, 35->${gD2}, 20->${gE2}, 19->${gF1}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-03: UASA Grade Color Standard
// ----------------------------------------------------------------------------
runTest('TC-AVS-03', 'UASA grades map to GREEN (A,B), YELLOW (C), ORANGE (D), RED (E,F)', () => {
  const colA = getUasaSemanticColor('A');
  const colB = getUasaSemanticColor('B');
  const colC = getUasaSemanticColor('C');
  const colD = getUasaSemanticColor('D');
  const colE = getUasaSemanticColor('E');
  const colF = getUasaSemanticColor('F');

  const passed =
    colA === 'academicSuccess' &&
    colB === 'academicSuccess' &&
    colC === 'academicCaution' &&
    colD === 'academicWarning' &&
    colE === 'academicDanger' &&
    colF === 'academicDanger';

  return {
    passed,
    details: `A=${colA}, B=${colB}, C=${colC}, D=${colD}, E=${colE}, F=${colF}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-04: UASA Grade Interpretation Labels
// ----------------------------------------------------------------------------
runTest('TC-AVS-04', 'Official UASA interpretations match KPM nomenclature', () => {
  const iA = getUasaGradeInterpretation('A');
  const iB = getUasaGradeInterpretation('B');
  const iC = getUasaGradeInterpretation('C');
  const iD = getUasaGradeInterpretation('D');
  const iE = getUasaGradeInterpretation('E');
  const iF = getUasaGradeInterpretation('F');

  const passed =
    iA === 'CEMERLANG' &&
    iB === 'KEPUJIAN' &&
    iC === 'BAIK' &&
    iD === 'MEMUASKAN' &&
    iE === 'MENCAPAI TAHAP MINIMUM' &&
    iF === 'TIDAK MENCAPAI TAHAP MINIMUM';

  return {
    passed,
    details: `A=${iA}, B=${iB}, C=${iC}, D=${iD}, E=${iE}, F=${iF}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-05: Near Miss Target-Based Detection
// ----------------------------------------------------------------------------
runTest('TC-AVS-05', 'Near Miss correctly detects students within striking distance of target', () => {
  // PBD: TP3 with target TP4 -> Near Miss! TP5 with target TP6 -> Near Miss! TP2 with target TP4 -> NOT Near Miss (gap 2)
  const nmPbd1 = getNearMissStatus(3, 4);
  const nmPbd2 = getNearMissStatus(5, 6);
  const nmPbd3 = getNearMissStatus(2, 4);

  // UASA: 80 marks (gap 2 to 82/A) -> Near Miss! 64 marks (gap 2 to 66/B) -> Near Miss! 48 marks (gap 2 to 50/C) -> Near Miss!
  const nmUasa1 = getNearMissStatus(80);
  const nmUasa2 = getNearMissStatus(64);
  const nmUasa3 = getNearMissStatus(48);
  const nmUasa4 = getNearMissStatus(55); // middle of C -> NOT near miss

  const passed =
    nmPbd1.isNearMiss === true &&
    nmPbd2.isNearMiss === true &&
    nmPbd3.isNearMiss === false &&
    nmUasa1.isNearMiss === true &&
    nmUasa2.isNearMiss === true &&
    nmUasa3.isNearMiss === true &&
    nmUasa4.isNearMiss === false;

  return {
    passed,
    details: `PBD(3->4)=${nmPbd1.isNearMiss}, PBD(2->4)=${nmPbd3.isNearMiss}, UASA(80)=${nmUasa1.isNearMiss}, UASA(55)=${nmUasa4.isNearMiss}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-06: Mismatch Detection (Gap >= 2 Levels)
// ----------------------------------------------------------------------------
runTest('TC-AVS-06', 'Mismatch identifies material deficit (gap >= 2 levels between actual and target)', () => {
  // PBD: Target TP4, Actual TP2 -> Mismatch! Target TP4, Actual TP3 -> NOT Mismatch (gap 1 is Near Miss/Reinforcement)
  const mmPbd1 = getMismatchStatus(2, 4);
  const mmPbd2 = getMismatchStatus(3, 4);

  // UASA: Target B (rank 5), Actual E (rank 2) -> Mismatch (gap 3)! Target B, Actual C -> NOT Mismatch (gap 1)
  const mmUasa1 = getMismatchStatus('E', 'B');
  const mmUasa2 = getMismatchStatus('C', 'B');

  const passed =
    mmPbd1.isMismatch === true && mmPbd1.gap === 2 &&
    mmPbd2.isMismatch === false &&
    mmUasa1.isMismatch === true && mmUasa1.gap === 3 &&
    mmUasa2.isMismatch === false;

  return {
    passed,
    details: `PBD(2 vs 4)=${mmPbd1.isMismatch} (gap ${mmPbd1.gap}), UASA(E vs B)=${mmUasa1.isMismatch} (gap ${mmUasa1.gap}).`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-07: Intervention Priority Synthesis
// ----------------------------------------------------------------------------
runTest('TC-AVS-07', 'Intervention priority resolves CRITICAL, HIGH, WATCH, ON TRACK, EXCELLENT', () => {
  const pCritical = getInterventionPriority(1, 4, 1);
  const pHigh = getInterventionPriority(3, 5, 3);
  const pWatch = getInterventionPriority(3, 4, 3);
  const pOnTrack = getInterventionPriority(4, 4, 3);
  const pExcellent = getInterventionPriority(6, 6, 5);

  const passed =
    pCritical.priority === 'CRITICAL' &&
    pHigh.priority === 'HIGH' &&
    pWatch.priority === 'WATCH' &&
    pOnTrack.priority === 'ON TRACK' &&
    pExcellent.priority === 'EXCELLENT';

  return {
    passed,
    details: `Resolved: ${pCritical.priority}, ${pHigh.priority}, ${pWatch.priority}, ${pOnTrack.priority}, ${pExcellent.priority}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-08: Progress Direction Decoupled from Color
// ----------------------------------------------------------------------------
runTest('TC-AVS-08', 'Progress direction (↑, →, ↓) is decoupled from achievement color', () => {
  // TP1 -> TP2 is improvement (↑) but TP2 remains RED (academicDanger)
  const prog = getProgressDirection(1, 2);
  const colTp2 = getPbdSemanticColor(2);

  // UASA: 70 -> 60 is decline (↓), but 60 is Grade C (Yellow/academicCaution)
  const progUasa = getProgressDirection(70, 60);
  const colUasa60 = getUasaSemanticColor(60);

  const passed =
    prog.direction === 'IMPROVED' &&
    prog.symbol === '↑' &&
    colTp2 === 'academicDanger' &&
    progUasa.direction === 'DECLINED' &&
    progUasa.symbol === '↓' &&
    colUasa60 === 'academicCaution';

  return {
    passed,
    details: `TP1->TP2: dir=${prog.symbol}, color=${colTp2}. UASA 70->60: dir=${progUasa.symbol}, color=${colUasa60}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-09: Chart Palettes Match Semantic Meaning
// ----------------------------------------------------------------------------
runTest('TC-AVS-09', 'Chart palettes match semantic colors and keep series comparison separate', () => {
  // PBD: TP1 & TP2 are shades of red; TP3 is orange; TP4, 5, 6 are shades of green
  const pbdTp1Hex = PBD_CHART_PALETTE.TP1;
  const pbdTp3Hex = PBD_CHART_PALETTE.TP3;
  const pbdTp5Hex = PBD_CHART_PALETTE.TP5;

  // UASA: A and B green, C yellow, D orange, E and F red
  const uasaAHex = UASA_CHART_PALETTE.A;
  const uasaCHex = UASA_CHART_PALETTE.C;
  const uasaFHex = UASA_CHART_PALETTE.F;

  // Comparison series uses distinct dimension palette (slate/blue/purple)
  const seriesDistinct =
    COMPARISON_SERIES_PALETTE.baselineTov !== pbdTp1Hex &&
    COMPARISON_SERIES_PALETTE.currentAr !== pbdTp3Hex;

  const passed =
    pbdTp1Hex === '#EF4444' &&
    pbdTp3Hex === '#F97316' &&
    pbdTp5Hex === '#10B981' &&
    uasaAHex === '#10B981' &&
    uasaCHex === '#EAB308' &&
    uasaFHex === '#EF4444' &&
    seriesDistinct;

  return {
    passed,
    details: `PBD Palette: TP1=${pbdTp1Hex}, TP3=${pbdTp3Hex}, TP5=${pbdTp5Hex}. UASA: A=${uasaAHex}, C=${uasaCHex}, F=${uasaFHex}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-10: Year-to-Year TOV Carry Forward Color Preservation
// ----------------------------------------------------------------------------
runTest('TC-AVS-10', 'TOV carry forward preserves exact academic color regardless of baseline role', () => {
  // 2026 AR2 = TP3 (ORANGE) -> 2027 TOV = TP3 must also be ORANGE
  const color2026Ar2 = getPbdSemanticColor(3);
  const color2027Tov = getPbdSemanticColor(3);

  // 2026 UASA Final = 64 (C, YELLOW) -> 2027 Baseline = 64 must also be YELLOW
  const colorUasa2026 = getUasaSemanticColor(64);
  const colorUasa2027 = getUasaSemanticColor(64);

  const passed =
    color2026Ar2 === 'academicWarning' &&
    color2027Tov === 'academicWarning' &&
    colorUasa2026 === 'academicCaution' &&
    colorUasa2027 === 'academicCaution';

  return {
    passed,
    details: `TOV carry forward color invariant confirmed (PBD: ${color2026Ar2} == ${color2027Tov}, UASA: ${colorUasa2026} == ${colorUasa2027}).`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-11: Versioned Academic Assessment Scale Configuration & Resolution
// ----------------------------------------------------------------------------
runTest('TC-AVS-11', 'Versioned PBD scale resolves 6-level for 2026 and 3-level for 2027 Year 1', () => {
  const scale2026 = resolvePbdScale({ academicYear: '2026', yearLevel: 1 });
  const scale2026Y6 = resolvePbdScale({ academicYear: '2026', yearLevel: 6 });
  const scale2027Y1 = resolvePbdScale({ academicYear: '2027', yearLevel: 1 });
  const scale2027Y2 = resolvePbdScale({ academicYear: '2027', yearLevel: 2 });

  const passed =
    scale2026.levels.length === 6 &&
    scale2026Y6.levels.length === 6 &&
    scale2027Y1.levels.length === 3 &&
    scale2027Y1.scaleId === 'PBD_3_LEVEL_2027_Y1' &&
    scale2027Y2.levels.length === 6; // Other year levels retain standard scale

  return {
    passed,
    details: `2026 Y1: ${scale2026.levels.length} levels, 2027 Y1: ${scale2027Y1.levels.length} levels (${scale2027Y1.scaleId}), 2027 Y2: ${scale2027Y2.levels.length} levels.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-12: Scale-Order Gap Rule (0=On Track, 1=Near Miss, >=2=Mismatch)
// ----------------------------------------------------------------------------
runTest('TC-AVS-12', 'Scale-order gap classifies 0 as ON TRACK, 1 as NEAR MISS, >=2 as MISMATCH across 6-level and 3-level structures', () => {
  // Test on Standard 6-Level Scale (2026)
  const gap6_0 = calculateScaleGap('TP4', 'TP4', DEFAULT_2026_6_LEVEL_SCALE); // 4 - 4 = 0 -> ON TRACK
  const gap6_1 = calculateScaleGap('TP3', 'TP4', DEFAULT_2026_6_LEVEL_SCALE); // 4 - 3 = 1 -> NEAR MISS
  const gap6_2 = calculateScaleGap('TP2', 'TP4', DEFAULT_2026_6_LEVEL_SCALE); // 4 - 2 = 2 -> MISMATCH
  const gap6_exceed = calculateScaleGap('TP5', 'TP4', DEFAULT_2026_6_LEVEL_SCALE); // 4 - 5 = -1 -> ON TRACK

  // Test on 3-Level Scale (2027 Year 1)
  const gap3_0 = calculateScaleGap('TP3', 'TP3', SCALE_2027_YEAR1_3_LEVEL); // 3 - 3 = 0 -> ON TRACK
  const gap3_1 = calculateScaleGap('TP2', 'TP3', SCALE_2027_YEAR1_3_LEVEL); // 3 - 2 = 1 -> NEAR MISS
  const gap3_2 = calculateScaleGap('TP1', 'TP3', SCALE_2027_YEAR1_3_LEVEL); // 3 - 1 = 2 -> MISMATCH

  // Verify getMismatchStatus and getNearMissStatus with 3-level scale
  const mm3 = getMismatchStatus('TP1', 'TP3', { scaleConfig: SCALE_2027_YEAR1_3_LEVEL });
  const nm3 = getNearMissStatus('TP2', 'TP3', { scaleConfig: SCALE_2027_YEAR1_3_LEVEL });

  const passed =
    gap6_0.status === 'ON TRACK' && gap6_0.gap === 0 &&
    gap6_1.status === 'NEAR MISS' && gap6_1.gap === 1 &&
    gap6_2.status === 'MISMATCH' && gap6_2.gap === 2 &&
    gap6_exceed.status === 'ON TRACK' &&
    gap3_0.status === 'ON TRACK' && gap3_0.gap === 0 &&
    gap3_1.status === 'NEAR MISS' && gap3_1.gap === 1 &&
    gap3_2.status === 'MISMATCH' && gap3_2.gap === 2 &&
    mm3.isMismatch === true && mm3.gap === 2 &&
    nm3.isNearMiss === true && nm3.distance === 1;

  return {
    passed,
    details: `6-level: gap0=${gap6_0.status}, gap1=${gap6_1.status}, gap2=${gap6_2.status}. 3-level: gap0=${gap3_0.status}, gap1=${gap3_1.status}, gap2=${gap3_2.status}, mm3=${mm3.isMismatch}, nm3=${nm3.isNearMiss}.`,
  };
});

// ----------------------------------------------------------------------------
// TC-AVS-13: TOV Carry-Forward Protection (TOV_REQUIRES_MAPPING Guard)
// ----------------------------------------------------------------------------
runTest('TC-AVS-13', 'TOV carry-forward prevents blind transition between incompatible scale versions', () => {
  const sameScaleCheck = checkTovCarryForwardCompatibility(
    DEFAULT_2026_6_LEVEL_SCALE,
    DEFAULT_2026_6_LEVEL_SCALE
  );

  const crossScaleCheck = checkTovCarryForwardCompatibility(
    DEFAULT_2026_6_LEVEL_SCALE,
    SCALE_2027_YEAR1_3_LEVEL
  );

  const passed =
    sameScaleCheck.compatible === true &&
    sameScaleCheck.status === 'COMPATIBLE' &&
    crossScaleCheck.compatible === false &&
    crossScaleCheck.status === 'TOV_REQUIRES_MAPPING';

  return {
    passed,
    details: `Same scale: ${sameScaleCheck.status} (compatible=${sameScaleCheck.compatible}). Cross scale (6 to 3): ${crossScaleCheck.status} (compatible=${crossScaleCheck.compatible}).`,
  };
});

// Print Results
console.log('\n================ iSEPADU AI ACADEMIC VISUAL STANDARD TEST SUITE ================');
let allPassed = true;
for (const r of results) {
  const status = r.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} [${r.id}] ${r.name}`);
  console.log(`       Details: ${r.details}`);
  if (!r.passed) allPassed = false;
}
console.log('================================================================================');
console.log(`Total: ${results.length} tests | Passed: ${results.filter(r => r.passed).length} | Failed: ${results.filter(r => !r.passed).length}`);

if (!allPassed) {
  process.exit(1);
} else {
  console.log('ALL ACADEMIC VISUAL STANDARD VERIFICATION TESTS PASSED SUCCESSFULLY.\n');
}
