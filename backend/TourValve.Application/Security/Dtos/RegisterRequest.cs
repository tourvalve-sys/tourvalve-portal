using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Application.Security.Dtos
{
    public class RegisterRequest
    {
        public string Email { get; set; } = string.Empty;
        public string CountryOfOrigin { get; set; } = string.Empty;
        public string PhoneNumber { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}
