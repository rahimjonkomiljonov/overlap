import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Field } from '@/components/form';
import { Body, Title } from '@/components/ui';
import { localized } from '@/lib/locale';
import { strings } from '@/lib/strings';
import { Chip, ChipRow, PickerField, StepFooter, useStepSave, type StepProps } from './common';
import { useColors, useStyles, type Palette } from '@/lib/theme';

/** Day (0 = Monday) times twelve two-hour blocks (0 = 12 to 2 am): the slot numbers the server stores. */
const BLOCKS_PER_DAY = 12;

/** When they are free. One day at a time, so every button is big enough to tap. Optional. */
export function FreeTimeStep(props: StepProps) {
  const [slots, setSlots] = useState<number[]>(props.profile.freeTimeSlots);
  const [day, setDay] = useState(0);
  const { save, busy, error } = useStepSave('free-time', props);
  const isOn = (block: number) => slots.includes(day * BLOCKS_PER_DAY + block);
  const toggle = (block: number) => {
    const slot = day * BLOCKS_PER_DAY + block;
    setSlots(slots.includes(slot) ? slots.filter((s) => s !== slot) : [...slots, slot]);
  };
  const dayBlocks = Array.from({ length: BLOCKS_PER_DAY }, (_, i) => day * BLOCKS_PER_DAY + i);
  const allOn = dayBlocks.every((s) => slots.includes(s));
  const countOn = (d: number) => slots.filter((s) => Math.floor(s / BLOCKS_PER_DAY) === d).length;

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.freeTimeTitle}</Title>
      <Body tone="muted">{strings.freeTimeHint}</Body>
      <ChipRow>
        {strings.days.map((name, d) => (
          <Chip key={name} radio label={countOn(d) ? `${name} (${countOn(d)})` : name} selected={day === d} onPress={() => setDay(d)} />
        ))}
      </ChipRow>
      <Chip label={strings.allDay} selected={allOn} onPress={() => setSlots(allOn ? slots.filter((s) => !dayBlocks.includes(s)) : [...new Set([...slots, ...dayBlocks])])} />
      <ChipRow>
        {strings.blocks.map((label, block) => (
          <Chip key={label} label={label} selected={isOn(block)} onPress={() => toggle(block)} />
        ))}
      </ChipRow>
      <Body tone="muted">{strings.freeSlotsCount(slots.length)}</Body>
      <StepFooter busy={busy} error={error} onNext={() => void save({ slots: [...slots].sort((a, b) => a - b) })} onSkip={props.onNext} />
    </View>
  );
}

/** Interest tags from the list, plus a few of their own. Optional. */
export function InterestsStep(props: StepProps) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const { profile, options } = props;
  const [tagIds, setTagIds] = useState<string[]>(profile.interestTags.map((t) => t.id));
  const [freeText, setFreeText] = useState<string[]>(profile.freeText);
  const [draft, setDraft] = useState('');
  const { save, busy, error } = useStepSave('interests', props);
  const max = options.limits.interests;
  const total = tagIds.length + freeText.length;
  const canAddMore = total < max;
  const addDraft = () => {
    const value = draft.trim();
    if (!value || !canAddMore || freeText.length >= options.limits.freeTextInterests || freeText.includes(value)) return;
    setFreeText([...freeText, value]);
    setDraft('');
  };

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.interestsTitle}</Title>
      <Body tone="muted">{strings.interestsHint(max)}</Body>
      <ChipRow>
        {options.interests.map((tag) => {
          const on = tagIds.includes(tag.id);
          return <Chip key={tag.id} label={localized(tag.labelKo, tag.labelEn)} selected={on} disabled={!on && !canAddMore} onPress={() => setTagIds(on ? tagIds.filter((x) => x !== tag.id) : [...tagIds, tag.id])} />;
        })}
      </ChipRow>
      <Body tone="muted">{strings.freeTextLabel}</Body>
      <ChipRow>
        {freeText.map((text) => (
          <Chip key={text} label={`${text}  ✕`} selected onPress={() => setFreeText(freeText.filter((x) => x !== text))} />
        ))}
      </ChipRow>
      <View style={styles.addRow}>
        <TextInput style={styles.input} value={draft} onChangeText={setDraft} placeholder={strings.freeTextPlaceholder} placeholderTextColor={colors.muted} accessibilityLabel={strings.freeTextPlaceholder} maxLength={30} onSubmitEditing={addDraft} returnKeyType="done" />
        <Pressable accessibilityRole="button" accessibilityLabel={strings.add} onPress={addDraft} style={styles.addButton}>
          <Text style={styles.addText}>{strings.add}</Text>
        </Pressable>
      </View>
      <Body tone="muted">{canAddMore ? strings.interestsCount(total, max) : strings.maxReached(max)}</Body>
      <StepFooter busy={busy} error={error} onNext={() => void save({ interestTagIds: tagIds, freeText })} onSkip={props.onNext} />
    </View>
  );
}

/** Three different prompts, each with an answer of up to 200 characters. */
export function PromptsStep(props: StepProps) {
  const { profile, options } = props;
  const required = options.limits.requiredPrompts;
  const [slots, setSlots] = useState<{ promptId: string | null; answer: string }[]>(
    Array.from({ length: required }, (_, i) => ({ promptId: profile.prompts[i]?.promptId ?? null, answer: profile.prompts[i]?.answer ?? '' })),
  );
  const { save, busy, error } = useStepSave('prompts', props);
  const update = (i: number, patch: Partial<(typeof slots)[number]>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const ready = slots.every((s) => s.promptId !== null && s.answer.trim().length > 0);

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.promptsTitle}</Title>
      <Body tone="muted">{strings.promptsHint}</Body>
      {slots.map((slot, i) => {
        // A prompt already used in another slot is not offered again.
        const taken = new Set(slots.filter((_, j) => j !== i).map((s) => s.promptId));
        const sections = [{ data: options.prompts.filter((p) => !taken.has(p.id)).map((p) => ({ value: p.id, label: p.textEn })) }];
        return (
          <View key={i} style={{ gap: 8 }}>
            <PickerField label={strings.promptNumber(i + 1)} value={slot.promptId} placeholder={strings.choosePrompt} sections={sections} onSelect={(v) => update(i, { promptId: v })} />
            <Field label={strings.answerPlaceholder} value={slot.answer} onChangeText={(t) => update(i, { answer: t })} maxLength={options.limits.promptAnswerLength} multiline />
            <Body tone="muted">{strings.charsLeft(options.limits.promptAnswerLength - slot.answer.length)}</Body>
          </View>
        );
      })}
      <StepFooter busy={busy} error={error} disabled={!ready} onNext={() => void save({ promptIds: slots.map((s) => s.promptId), answers: slots.map((s) => s.answer.trim()) })} />
    </View>
  );
}

/** Eight statements, each rated from 1 to 5. */
export function ValuesStep(props: StepProps) {
  const styles = useStyles(makeStyles);
  const { profile, options } = props;
  const [answers, setAnswers] = useState<number[]>(Array.from({ length: options.limits.valuesQuizLength }, (_, i) => profile.valuesAnswers[i] ?? 0));
  const { save, busy, error } = useStepSave('values', props);

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.valuesTitle}</Title>
      <Body tone="muted">{strings.valuesHint}</Body>
      {options.valuesQuiz.map((item, i) => (
        <View key={item.key} style={{ gap: 8 }}>
          <Body>{item.textEn}</Body>
          <View style={styles.scale}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ checked: answers[i] === n }}
                accessibilityLabel={`${item.textEn} ${n}: ${strings.scaleNames[n - 1]}`}
                onPress={() => setAnswers(answers.map((a, j) => (j === i ? n : a)))}
                style={[styles.scaleButton, answers[i] === n && styles.scaleButtonOn]}
              >
                <Text style={[styles.scaleText, answers[i] === n && styles.scaleTextOn]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.scaleEnds}>
            <Text style={styles.scaleEnd}>{strings.scaleNames[0]}</Text>
            <Text style={styles.scaleEnd}>{strings.scaleNames[4]}</Text>
          </View>
        </View>
      ))}
      <StepFooter busy={busy} error={error} disabled={answers.some((a) => a === 0)} onNext={() => void save({ answers })} />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, fontSize: 18, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.onBrand },
  addButton: { minHeight: 52, minWidth: 64, borderRadius: 26, borderWidth: 2, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  addText: { color: colors.brand, fontWeight: '800', fontSize: 16 },
  scale: { flexDirection: 'row', gap: 8 },
  scaleButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.onBrand },
  scaleButtonOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  scaleText: { fontSize: 18, fontWeight: '700', color: colors.ink },
  scaleTextOn: { color: colors.onBrand },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleEnd: { fontSize: 12, color: colors.muted },
});
