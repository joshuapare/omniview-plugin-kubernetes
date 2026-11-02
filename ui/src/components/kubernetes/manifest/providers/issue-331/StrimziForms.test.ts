import { describe, it, expect } from 'vitest';
import { topicPartitionError } from './StrimziForms';
describe('topic partition changes', () => {
 it('rejects shrinking existing topics', () => { expect(topicPartitionError(2n,3)).toBe('Partitions cannot decrease.'); });
 it('allows growth and unchanged partition count', () => { expect(topicPartitionError(4n,3)).toBeNull(); expect(topicPartitionError(3n,3)).toBeNull(); });
 it('compares exact wide partition counts without rounding', () => { expect(topicPartitionError(9007199254740992n,9007199254740993n)).toBe('Partitions cannot decrease.'); });
 it('does not mistake missing baseline for zero', () => { expect(topicPartitionError(1n,undefined)).toBeNull(); });
});
