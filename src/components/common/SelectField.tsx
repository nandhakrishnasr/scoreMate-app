import Icon from '../Icon'

export interface SelectFieldProps {
  label: string
  value: string
  onClick: () => void
  placeholder: string
}

export function SelectField({ label, value, onClick, placeholder }: SelectFieldProps) {
  return (
    <div className="select-field-container">
      <span className="select-field-label">{label}</span>
      <button className="select-field-trigger" onClick={onClick}>
        <strong>{value || placeholder}</strong>
        <Icon name="chevron-down" size={16} />
      </button>
    </div>
  )
}

export default SelectField
