import { useState } from 'react';
import { View } from 'react-native';

import { Field } from '@/components/form';
import { Body, Title } from '@/components/ui';
import { localized } from '@/lib/locale';
import { strings } from '@/lib/strings';
import { Chip, ChipRow, PickerField, StepFooter, useStepSave, type StepProps } from './common';
import { SearchPicker, type Pick, type PickKind } from './search-picker';

/** Name, gender, pronouns, year, department and (only with the sensitive consent) who they would like to meet. */
export function BasicsStep(props: StepProps) {
  const { profile, options } = props;
  const [firstName, setFirstName] = useState(profile.firstName);
  const [gender, setGender] = useState<string | null>(profile.gender);
  const [pronouns, setPronouns] = useState(profile.pronouns);
  const [year, setYear] = useState<number | null>(profile.year);
  const [major, setMajor] = useState<string | null>(profile.major || null);
  const [interestedIn, setInterestedIn] = useState<string[]>(profile.interestedIn);
  const { save, busy, error } = useStepSave('basics', props);

  // "Who I'd like to meet" only exists for people who agreed to share it. Everyone else is never asked.
  const consented = profile.datingStatus !== 'needs_consent';
  const majorSections = options.majorGroups.map((g) => ({ title: localized(g.college.ko, g.college.en), data: g.majors.map((m) => ({ value: m.ko, label: localized(m.ko, m.en) })) }));
  const maxYear = Math.max(...options.studyYears);
  const yearSections = [{ data: options.studyYears.map((y) => ({ value: String(y), label: strings.yearName(y, maxYear) })) }];
  const ready = firstName.trim().length > 0 && gender !== null && year !== null && major !== null;

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.basicsTitle}</Title>
      <Field testID="first-name" label={strings.firstNameLabel} value={firstName} onChangeText={setFirstName} maxLength={50} autoCapitalize="words" />
      <View style={{ gap: 6 }}>
        <Body tone="muted">{strings.genderLabel}</Body>
        <ChipRow>
          {options.genders.map((g) => (
            <Chip key={g} radio label={strings.genderNames[g] ?? g} selected={gender === g} onPress={() => setGender(g)} />
          ))}
        </ChipRow>
      </View>
      <Field label={strings.pronounsLabel} value={pronouns} onChangeText={setPronouns} maxLength={30} autoCapitalize="none" />
      <PickerField testID="year-picker" label={strings.yearLabel} value={year === null ? null : String(year)} sections={yearSections} onSelect={(v) => setYear(Number(v))} />
      <PickerField testID="major-picker" label={strings.majorLabel} value={major} sections={majorSections} onSelect={setMajor} />
      {consented ? (
        <View style={{ gap: 6 }}>
          <Body tone="muted">{strings.interestedInLabel}</Body>
          <ChipRow>
            {options.genders.map((g) => (
              <Chip
                key={g}
                label={strings.genderNames[g] ?? g}
                selected={interestedIn.includes(g)}
                onPress={() => setInterestedIn(interestedIn.includes(g) ? interestedIn.filter((x) => x !== g) : [...interestedIn, g])}
              />
            ))}
          </ChipRow>
          <Body tone="muted">{strings.interestedInHint}</Body>
        </View>
      ) : (
        <Body tone="muted">{strings.noSensitiveConsent}</Body>
      )}
      <StepFooter
        busy={busy}
        error={error}
        disabled={!ready}
        onNext={() =>
          void save({
            firstName: firstName.trim(),
            gender,
            ...(pronouns.trim() ? { pronouns: pronouns.trim() } : {}),
            year,
            major,
            interestedIn: consented ? interestedIn : [],
          })
        }
      />
    </View>
  );
}

/** What they are here for. Dating is only offered when the consent and the cohort allow it. */
export function IntentsStep(props: StepProps) {
  const { profile } = props;
  const [intents, setIntents] = useState<string[]>(profile.intents);
  const { save, busy, error } = useStepSave('intents', props);
  const datingBlocked = profile.datingStatus !== 'available';
  const toggle = (value: string) => setIntents(intents.includes(value) ? intents.filter((x) => x !== value) : [...intents, value]);

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.intentsTitle}</Title>
      <Body tone="muted">{strings.intentsHint}</Body>
      <ChipRow>
        {(['FRIENDS', 'STUDY', 'DATING', 'OPEN'] as const).map((value) => (
          <Chip key={value} label={strings.intentNames[value]} selected={intents.includes(value)} disabled={value === 'DATING' && datingBlocked} onPress={() => toggle(value)} />
        ))}
      </ChipRow>
      {datingBlocked ? <Body tone="muted">{profile.datingStatus === 'cohort_closed' ? strings.datingCohortClosed : strings.datingLocked}</Body> : null}
      <StepFooter busy={busy} error={error} disabled={intents.length === 0} onNext={() => void save({ intents })} />
    </View>
  );
}

const PICKS = {
  courses: { kind: 'course', title: 'coursesTitle', hint: 'coursesHint', route: 'courses', body: 'courseIds' },
  clubs: { kind: 'club', title: 'clubsTitle', hint: 'clubsHint', route: 'clubs', body: 'clubIds' },
  spots: { kind: 'spot', title: 'spotsTitle', hint: 'spotsHint', route: 'spots', body: 'spotIds' },
} as const;

/** Courses, clubs and hangout spots share one screen shape: search, add, remove, save. All optional. */
export function PicksStep({ what, ...props }: StepProps & { what: keyof typeof PICKS }) {
  const config = PICKS[what];
  const { profile, options } = props;
  const initial: Pick[] =
    what === 'courses' ? profile.courses.map((c) => ({ id: c.id, label: `${c.code} ${c.title}` })) : what === 'clubs' ? profile.clubs.map((c) => ({ id: c.id, label: c.name })) : profile.spots.map((s) => ({ id: s.id, label: s.name }));
  const [picks, setPicks] = useState<Pick[]>(initial);
  const { save, busy, error } = useStepSave(config.route, props);
  const max = what === 'courses' ? options.limits.courses : what === 'clubs' ? options.limits.clubs : options.limits.spots;

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings[config.title]}</Title>
      <Body tone="muted">{strings[config.hint]}</Body>
      <SearchPicker kind={config.kind as PickKind} max={max} picks={picks} onChange={setPicks} />
      <StepFooter busy={busy} error={error} onNext={() => void save({ [config.body]: picks.map((p) => p.id) })} onSkip={props.onNext} />
    </View>
  );
}
