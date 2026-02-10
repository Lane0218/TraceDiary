interface AuthFormFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder: string
  type?: 'text' | 'password'
  autoComplete?: string
  testId?: string
  containerClassName: string
  labelClassName?: string
  inputClassName: string
}

export function AuthFormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  testId,
  containerClassName,
  labelClassName,
  inputClassName,
}: AuthFormFieldProps) {
  return (
    <label className={containerClassName}>
      <span className={labelClassName}>{label}</span>
      <input
        className={inputClassName}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        data-testid={testId}
      />
    </label>
  )
}
