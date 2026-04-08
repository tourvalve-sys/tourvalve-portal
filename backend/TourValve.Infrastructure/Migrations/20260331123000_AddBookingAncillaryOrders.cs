using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TourValve.Infrastructure.Data;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    [DbContext(typeof(TourValveDbContext))]
    [Migration("20260331123000_AddBookingAncillaryOrders")]
    public partial class AddBookingAncillaryOrders : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BookingAncillaryOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BookingId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    SegmentLabel = table.Column<string>(type: "text", nullable: false),
                    OptionCode = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    BaseAmount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    MarkupAmount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    FulfillmentMode = table.Column<string>(type: "text", nullable: false),
                    ProviderReference = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: false),
                    ErrorMessage = table.Column<string>(type: "text", nullable: false),
                    WalletHoldId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FulfilledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RefundedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookingAncillaryOrders", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookingAncillaryOrders_AgentId_Status_RequestedAt",
                table: "BookingAncillaryOrders",
                columns: new[] { "AgentId", "Status", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BookingAncillaryOrders_BookingId_RequestedAt",
                table: "BookingAncillaryOrders",
                columns: new[] { "BookingId", "RequestedAt" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BookingAncillaryOrders");
        }
    }
}
