export interface ChoiceProps {
  checked: boolean
  label: string
  onClick: () => void
}

export function Choice({ checked, label, onClick }: ChoiceProps) {
  return (
    <button className="choice" onClick={onClick}>
      <i className={checked ? 'radio checked' : 'radio'} />
      {label}
    </button>
  )
}

export default Choice
