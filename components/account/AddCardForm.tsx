// ============================================================================
// ADD CARD FORM - TRENS
// Formulario inline para agregar una nueva tarjeta de crédito/débito.
// Tokeniza con OpenPay client-side y guarda vía edge function.
// ============================================================================

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CreditCard, AlertCircle, CheckCircle, X } from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { Alert } from '../../lib/alert';
import {
  createCardToken,
  formatCardNumber,
  formatExpiry,
  validateCardNumber,
  validateCVV,
  validateExpiry,
  getCardBrand,
} from '../../lib/openpay';
import { saveCard } from '../../services/cards';

// ============================================================================
// TIPOS
// ============================================================================

interface AddCardFormProps {
  onCardAdded: () => void;
  onCancel: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AddCardForm({ onCardAdded, onCancel }: AddCardFormProps) {
  // Form fields
  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Refs para avanzar entre inputs
  const holderRef = useRef<TextInput>(null);
  const expiryRef = useRef<TextInput>(null);
  const cvvRef = useRef<TextInput>(null);

  // Derived
  const cleanNumber = cardNumber.replace(/\s/g, '');
  const brand = getCardBrand(cleanNumber);
  const isNumberValid = cleanNumber.length >= 13 && validateCardNumber(cleanNumber);
  const expiryParts = expiry.split('/');
  const isExpiryValid =
    expiryParts.length === 2 &&
    expiryParts[0].length === 2 &&
    expiryParts[1].length === 2 &&
    validateExpiry(expiryParts[0], expiryParts[1]);
  const isCvvValid = validateCVV(cvv, brand);
  const isFormValid = isNumberValid && holderName.trim().length >= 3 && isExpiryValid && isCvvValid;

  // Brand display
  const getBrandLabel = (b: string): string => {
    const labels: Record<string, string> = {
      visa: 'VISA',
      mastercard: 'MASTERCARD',
      amex: 'AMEX',
      discover: 'DISCOVER',
      diners: 'DINERS',
      jcb: 'JCB',
    };
    return labels[b] || '';
  };

  // -------------------------------------------------------------------------
  // HANDLE NUMBER INPUT
  // -------------------------------------------------------------------------
  const handleNumberChange = (text: string) => {
    const formatted = formatCardNumber(text);
    const maxLen = brand === 'amex' ? 17 : 19; // 15 digits + spaces vs 16 digits + spaces
    setCardNumber(formatted.substring(0, maxLen));

    // Auto-advance when complete
    const digits = formatted.replace(/\s/g, '').length;
    const targetDigits = brand === 'amex' ? 15 : 16;
    if (digits >= targetDigits) {
      holderRef.current?.focus();
    }
  };

  // -------------------------------------------------------------------------
  // HANDLE EXPIRY INPUT
  // -------------------------------------------------------------------------
  const handleExpiryChange = (text: string) => {
    // Remove non-digits
    const cleaned = text.replace(/[^0-9]/g, '');

    if (cleaned.length <= 4) {
      const formatted = formatExpiry(cleaned);
      setExpiry(formatted);

      // Auto-advance when complete
      if (cleaned.length === 4) {
        cvvRef.current?.focus();
      }
    }
  };

  // -------------------------------------------------------------------------
  // HANDLE CVV INPUT
  // -------------------------------------------------------------------------
  const handleCvvChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const maxLen = brand === 'amex' ? 4 : 3;
    setCvv(cleaned.substring(0, maxLen));
  };

  // -------------------------------------------------------------------------
  // SUBMIT
  // -------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!isFormValid) {
      Alert.alert('Error', 'Por favor completa todos los campos correctamente.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Tokenizar con OpenPay (client-side, llave pública)
      const token = await createCardToken({
        card_number: cleanNumber,
        holder_name: holderName.trim().toUpperCase(),
        expiration_month: expiryParts[0],
        expiration_year: expiryParts[1],
        cvv2: cvv,
      });

      // 2. Guardar tarjeta vía edge function (server-side, llave privada)
      await saveCard(token.id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Tarjeta agregada', 'Tu tarjeta ha sido guardada exitosamente.');

      // Reset form
      setCardNumber('');
      setHolderName('');
      setExpiry('');
      setCvv('');

      onCardAdded();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err.message || 'No se pudo agregar la tarjeta.');
    } finally {
      setIsSaving(false);
    }
  };

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="bg-zinc-800/80 rounded-2xl p-5 border border-zinc-700/50">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-row items-center gap-2">
            <CreditCard size={18} color="#F97316" />
            <Text className="text-white font-bold text-sm uppercase tracking-widest">
              Nueva Tarjeta
            </Text>
          </View>
          <TouchableOpacity onPress={onCancel} className="p-1">
            <X size={18} color="#71717A" />
          </TouchableOpacity>
        </View>

        {/* Card Number */}
        <View className="mb-4">
          <Text className="text-zinc-400 text-xs mb-1.5 uppercase tracking-wider">
            Número de tarjeta
          </Text>
          <View className="flex-row items-center bg-zinc-900 rounded-xl border border-zinc-700 px-4">
            <TextInput
              value={cardNumber}
              onChangeText={handleNumberChange}
              placeholder="4111 1111 1111 1111"
              placeholderTextColor="#3F3F46"
              className="flex-1 text-white text-lg py-3 font-mono"
              keyboardType="number-pad"
              maxLength={19}
              returnKeyType="next"
              onSubmitEditing={() => holderRef.current?.focus()}
            />
            {cleanNumber.length > 0 && (
              <View className="flex-row items-center gap-1">
                {brand !== 'unknown' && (
                  <Text className="text-orange-400 text-xs font-bold">{getBrandLabel(brand)}</Text>
                )}
                {isNumberValid ? (
                  <CheckCircle size={16} color="#22C55E" />
                ) : cleanNumber.length >= 13 ? (
                  <AlertCircle size={16} color="#EF4444" />
                ) : null}
              </View>
            )}
          </View>
        </View>

        {/* Holder Name */}
        <View className="mb-4">
          <Text className="text-zinc-400 text-xs mb-1.5 uppercase tracking-wider">
            Titular de la tarjeta
          </Text>
          <TextInput
            ref={holderRef}
            value={holderName}
            onChangeText={setHolderName}
            placeholder="NOMBRE COMO APARECE EN LA TARJETA"
            placeholderTextColor="#3F3F46"
            className="bg-zinc-900 text-white text-base py-3 px-4 rounded-xl border border-zinc-700"
            autoCapitalize="characters"
            returnKeyType="next"
            onSubmitEditing={() => expiryRef.current?.focus()}
          />
        </View>

        {/* Expiry + CVV Row */}
        <View className="flex-row gap-3 mb-5">
          {/* Expiry */}
          <View className="flex-1">
            <Text className="text-zinc-400 text-xs mb-1.5 uppercase tracking-wider">
              Vencimiento
            </Text>
            <View className="flex-row items-center bg-zinc-900 rounded-xl border border-zinc-700 px-4">
              <TextInput
                ref={expiryRef}
                value={expiry}
                onChangeText={handleExpiryChange}
                placeholder="MM/AA"
                placeholderTextColor="#3F3F46"
                className="flex-1 text-white text-base py-3 font-mono"
                keyboardType="number-pad"
                maxLength={5}
                returnKeyType="next"
                onSubmitEditing={() => cvvRef.current?.focus()}
              />
              {expiry.length === 5 &&
                (isExpiryValid ? (
                  <CheckCircle size={14} color="#22C55E" />
                ) : (
                  <AlertCircle size={14} color="#EF4444" />
                ))}
            </View>
          </View>

          {/* CVV */}
          <View className="flex-1">
            <Text className="text-zinc-400 text-xs mb-1.5 uppercase tracking-wider">CVV</Text>
            <View className="flex-row items-center bg-zinc-900 rounded-xl border border-zinc-700 px-4">
              <TextInput
                ref={cvvRef}
                value={cvv}
                onChangeText={handleCvvChange}
                placeholder={brand === 'amex' ? '••••' : '•••'}
                placeholderTextColor="#3F3F46"
                className="flex-1 text-white text-base py-3 font-mono"
                keyboardType="number-pad"
                maxLength={brand === 'amex' ? 4 : 3}
                secureTextEntry
                returnKeyType="done"
              />
              {cvv.length >= 3 &&
                (isCvvValid ? (
                  <CheckCircle size={14} color="#22C55E" />
                ) : (
                  <AlertCircle size={14} color="#EF4444" />
                ))}
            </View>
          </View>
        </View>

        {/* Security Note */}
        <View className="flex-row items-start gap-2 mb-5 bg-zinc-900/50 p-3 rounded-xl">
          <View className="mt-0.5">
            <CheckCircle size={14} color="#22C55E" />
          </View>
          <Text className="text-zinc-500 text-xs flex-1">
            Tu tarjeta se tokeniza de forma segura con OpenPay. No almacenamos datos sensibles.
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!isFormValid || isSaving}
          className={`py-4 rounded-xl ${!isFormValid || isSaving ? 'bg-zinc-700' : 'bg-red-600'}`}
        >
          {isSaving ? (
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator color="#fff" size="small" />
              <Text className="text-white font-bold">Procesando...</Text>
            </View>
          ) : (
            <Text className="text-white text-center font-bold uppercase tracking-widest">
              Agregar Tarjeta
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
