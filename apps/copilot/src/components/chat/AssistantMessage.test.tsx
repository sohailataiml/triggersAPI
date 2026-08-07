import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistantMessage } from './AssistantMessage';

describe('AssistantMessage', () => {
  it('renders plain text', () => {
    render(<AssistantMessage text="One delivery is pending." streaming={false} />);
    expect(screen.getByText('One delivery is pending.')).toBeInTheDocument();
  });

  it('renders inline code and bold spans', () => {
    const { container } = render(
      <AssistantMessage text="Call `lease_deliveries` for **pending** work." streaming={false} />,
    );

    expect(container.querySelector('code')?.textContent).toBe('lease_deliveries');
    expect(container.querySelector('strong')?.textContent).toBe('pending');
  });

  it('renders bullet lines as list rows', () => {
    const { container } = render(
      <AssistantMessage text={'- first item\n- second item'} streaming={false} />,
    );

    expect(container.textContent).toContain('first item');
    expect(container.textContent).toContain('second item');
  });

  it('escapes HTML in model output rather than rendering it', () => {
    // Event payloads are third-party data; the model can quote them verbatim.
    const hostile = '<img src=x onerror="alert(1)"> and <script>alert(2)</script>';
    const { container } = render(<AssistantMessage text={hostile} streaming={false} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x');
  });

  it('shows a caret while still streaming', () => {
    render(<AssistantMessage text="Working" streaming />);
    expect(screen.getByLabelText('Assistant is still writing')).toBeInTheDocument();
  });

  it('shows no caret once the turn is settled', () => {
    render(<AssistantMessage text="Done" streaming={false} />);
    expect(screen.queryByLabelText('Assistant is still writing')).not.toBeInTheDocument();
  });
});
