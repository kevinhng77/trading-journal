# Position labels: shares @ average cost (only when in a position)

def qty = GetQuantity();
def entryPrice = GetAveragePrice();
def inPosition = qty != 0;

AddLabel(inPosition, qty + " @ " + AsDollars(entryPrice), Color.GRAY);
