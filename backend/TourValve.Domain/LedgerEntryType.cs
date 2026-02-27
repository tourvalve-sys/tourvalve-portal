using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Domain;

public enum LedgerEntryType
{
    TopUp = 1,
    Capture = 2,
    Adjustment = 3,
    Refund = 4
}
