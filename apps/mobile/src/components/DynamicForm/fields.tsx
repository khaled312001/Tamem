import {
  Camera,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  MapPin,
  Phone,
  Type,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { type Control, Controller, type FieldErrors, type FieldValues } from 'react-hook-form';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ServiceField } from '@tamem/types';

import { colors, fontFamilies, fontSizes, radii, spacing } from '../../theme/tokens';

interface BaseProps {
  field: ServiceField;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
}

function FieldLabel({ field }: { field: ServiceField }) {
  return (
    <Text style={styles.label}>
      {field.labelAr}
      {field.isRequired && <Text style={styles.required}> *</Text>}
    </Text>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function TextFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue=""
        render={({ field: { value, onChange, onBlur } }) => (
          <View style={[styles.input, err && styles.errored]}>
            <Type size={16} color={colors.brand.red} />
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={field.placeholderAr ?? ''}
              placeholderTextColor={colors.text.muted}
              style={styles.text}
            />
          </View>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

export function TextAreaFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue=""
        render={({ field: { value, onChange, onBlur } }) => (
          <View style={[styles.inputArea, err && styles.errored]}>
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={field.placeholderAr ?? ''}
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={4}
              style={[styles.text, styles.textArea]}
            />
          </View>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

export function NumberFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue={undefined}
        render={({ field: { value, onChange, onBlur } }) => (
          <View style={[styles.input, err && styles.errored]}>
            <TextInput
              value={value !== undefined && value !== null ? String(value) : ''}
              onChangeText={(t) => onChange(t === '' ? undefined : Number(t))}
              onBlur={onBlur}
              placeholder={field.placeholderAr ?? '0'}
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              style={styles.text}
            />
          </View>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

export function PhoneFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue=""
        render={({ field: { value, onChange, onBlur } }) => (
          <View style={[styles.input, err && styles.errored]}>
            <Phone size={16} color={colors.brand.red} />
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={field.placeholderAr ?? '+201XXXXXXXXX'}
              placeholderTextColor={colors.text.muted}
              keyboardType="phone-pad"
              style={styles.text}
            />
          </View>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

export function BooleanFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <Controller
        control={control}
        name={field.key}
        defaultValue={false}
        render={({ field: { value, onChange } }) => (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{field.labelAr}</Text>
              {field.helpTextAr && <Text style={styles.help}>{field.helpTextAr}</Text>}
            </View>
            <Switch
              value={!!value}
              onValueChange={onChange}
              trackColor={{ false: colors.line2, true: colors.brand.red }}
              thumbColor={colors.white}
            />
          </View>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

export function SelectFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue=""
        render={({ field: { value, onChange } }) => {
          const selectedLabel = field.options?.find((o) => o.value === value)?.labelAr ?? 'اختر…';
          return (
            <>
              <Pressable
                onPress={() => setOpen(true)}
                style={[styles.input, err && styles.errored]}
              >
                <ChevronDown size={16} color={colors.brand.red} />
                <Text style={[styles.text, !value && { color: colors.text.muted }]}>
                  {selectedLabel}
                </Text>
              </Pressable>
              <Modal
                visible={open}
                transparent
                animationType="slide"
                onRequestClose={() => setOpen(false)}
              >
                <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
                <View style={styles.modalSheet}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{field.labelAr}</Text>
                    <Pressable onPress={() => setOpen(false)}>
                      <X size={20} color={colors.ink} />
                    </Pressable>
                  </View>
                  <FlatList
                    data={field.options ?? []}
                    keyExtractor={(o) => o.value}
                    renderItem={({ item }) => {
                      const isOn = item.value === value;
                      return (
                        <Pressable
                          onPress={() => {
                            onChange(item.value);
                            setOpen(false);
                          }}
                          style={styles.modalRow}
                        >
                          <Text style={styles.modalRowText}>{item.labelAr}</Text>
                          {isOn && <Check size={18} color={colors.brand.red} />}
                        </Pressable>
                      );
                    }}
                  />
                </View>
              </Modal>
            </>
          );
        }}
      />
      <FieldError message={err} />
    </View>
  );
}

export function ImageFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  const maxImages = field.validation?.maxImages ?? 5;

  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue={[]}
        render={({ field: { value, onChange } }) => {
          const urls = (value as string[] | undefined) ?? [];
          const addImage = async () => {
            // Lazy import to keep startup light
            const ImagePicker = await import('expo-image-picker');
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.85,
            });
            if (result.canceled || !result.assets?.[0]) return;
            // TODO: actual upload via api.raw.post('/uploads', ...) — store local URI for now
            onChange([...urls, result.assets[0].uri]);
          };

          return (
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Pressable
                  onPress={addImage}
                  disabled={urls.length >= maxImages}
                  style={({ pressed }) => [
                    styles.imageAdd,
                    pressed && { opacity: 0.85 },
                    urls.length >= maxImages && { opacity: 0.4 },
                  ]}
                >
                  <Camera size={28} color={colors.brand.red} />
                  <Text style={styles.imageAddText}>إضافة صورة</Text>
                  <Text style={styles.imageAddCount}>
                    {urls.length}/{maxImages}
                  </Text>
                </Pressable>
                {urls.map((url, idx) => (
                  <View key={`${url}-${idx}`} style={styles.imageThumb}>
                    <Image source={{ uri: url }} style={styles.imageThumbImg} />
                    <Pressable
                      onPress={() => onChange(urls.filter((_, i) => i !== idx))}
                      style={styles.imageRemove}
                    >
                      <X size={12} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          );
        }}
      />
      <FieldError message={err} />
    </View>
  );
}

export function LocationFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue={undefined}
        render={({ field: { value, onChange } }) => (
          <Pressable
            onPress={async () => {
              const Location = await import('expo-location');
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') return;
              const loc = await Location.getCurrentPositionAsync({});
              onChange({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                address: 'موقعي الحالي',
              });
            }}
            style={[styles.input, err && styles.errored]}
          >
            <MapPin size={16} color={colors.brand.red} />
            <Text style={[styles.text, !value && { color: colors.text.muted }]}>
              {value?.address ?? 'اضغط لاختيار الموقع'}
            </Text>
          </Pressable>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

export function DateFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue=""
        render={({ field: { value, onChange, onBlur } }) => (
          <View style={[styles.input, err && styles.errored]}>
            <Calendar size={16} color={colors.brand.red} />
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.text.muted}
              style={styles.text}
            />
          </View>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

export function TimeFieldInput({ field, control, errors }: BaseProps) {
  const err = errors[field.key]?.message as string | undefined;
  return (
    <View style={styles.wrap}>
      <FieldLabel field={field} />
      <Controller
        control={control}
        name={field.key}
        defaultValue=""
        render={({ field: { value, onChange, onBlur } }) => (
          <View style={[styles.input, err && styles.errored]}>
            <Clock size={16} color={colors.brand.red} />
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="HH:MM"
              placeholderTextColor={colors.text.muted}
              style={styles.text}
            />
          </View>
        )}
      />
      <FieldError message={err} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  required: { color: colors.brand.red },
  help: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginTop: 2,
    fontFamily: fontFamilies.body,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputArea: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errored: { borderColor: colors.danger },
  text: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    textAlign: 'right',
    fontFamily: fontFamilies.body,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  error: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
    fontFamily: fontFamilies.body,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '60%',
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.headingBlack, color: colors.ink },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalRowText: { fontSize: fontSizes.md, color: colors.ink, fontFamily: fontFamilies.body },
  imageAdd: {
    width: 100,
    height: 100,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.brand.red,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    backgroundColor: colors.white,
  },
  imageAddText: {
    fontSize: fontSizes.xs,
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyBold,
    marginTop: 4,
  },
  imageAddCount: { fontSize: 10, color: colors.text.muted, fontFamily: fontFamilies.body },
  imageThumb: {
    width: 100,
    height: 100,
    borderRadius: radii.lg,
    marginRight: spacing.sm,
    position: 'relative',
  },
  imageThumbImg: { width: '100%', height: '100%', borderRadius: radii.lg },
  imageRemove: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
